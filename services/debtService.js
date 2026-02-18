const Debt = require('../models/Debt');
const mongoose = require('mongoose');

class DebtService {
  /**
   * Calculate amortization schedule for a debt
   */
  calculateAmortizationSchedule(debt, extraPayment = 0) {
    const monthlyInterestRate = (debt.interestRate / 100) / 12;
    let remainingBalance = debt.currentBalance;
    let month = 1;
    const schedule = [];
    const maxMonths = 600; // 50 years cap
    
    const monthlyPayment = debt.monthlyPayment + extraPayment;
    
    while (remainingBalance > 0.01 && month <= maxMonths) {
      const interestPayment = remainingBalance * monthlyInterestRate;
      let principalPayment = monthlyPayment - interestPayment;
      
      // Adjust final payment
      if (principalPayment >= remainingBalance) {
        principalPayment = remainingBalance;
        remainingBalance = 0;
      } else {
        remainingBalance -= principalPayment;
      }
      
      schedule.push({
        month,
        payment: monthlyPayment,
        principalPayment: Math.round(principalPayment * 100) / 100,
        interestPayment: Math.round(interestPayment * 100) / 100,
        remainingBalance: Math.round(remainingBalance * 100) / 100,
        totalInterestToDate: schedule.reduce((sum, p) => sum + p.interestPayment, 0) + interestPayment
      });
      
      month++;
    }
    
    return schedule;
  }

  /**
   * Calculate early payoff analysis
   */
  calculateEarlyPayoffAnalysis(debt, extraPayment = 0) {
    const standardSchedule = this.calculateAmortizationSchedule(debt, 0);
    const acceleratedSchedule = this.calculateAmortizationSchedule(debt, extraPayment);
    
    const standardMonths = standardSchedule.length;
    const acceleratedMonths = acceleratedSchedule.length;
    const monthsSaved = standardMonths - acceleratedMonths;
    
    const standardInterest = standardSchedule[standardSchedule.length - 1]?.totalInterestToDate || 0;
    const acceleratedInterest = acceleratedSchedule[acceleratedSchedule.length - 1]?.totalInterestToDate || 0;
    const interestSaved = standardInterest - acceleratedInterest;
    
    return {
      currentPayoffMonths: standardMonths,
      acceleratedPayoffMonths: acceleratedMonths,
      monthsSaved,
      currentTotalInterest: Math.round(standardInterest * 100) / 100,
      acceleratedTotalInterest: Math.round(acceleratedInterest * 100) / 100,
      interestSaved: Math.round(interestSaved * 100) / 100,
      extraPaymentMonthly: extraPayment,
      breakEvenDate: this.calculateBreakEvenDate(monthsSaved)
    };
  }

  /**
   * Calculate break-even date
   */
  calculateBreakEvenDate(monthsSaved) {
    const date = new Date();
    date.setMonth(date.getMonth() + monthsSaved);
    return date;
  }

  /**
   * Calculate debt-to-income ratio
   */
  async calculateDebtToIncomeRatio(userId, monthlyIncome) {
    if (!monthlyIncome || monthlyIncome <= 0) {
      return {
        ratio: 0,
        status: 'unknown',
        monthlyDebtPayments: 0,
        monthlyIncome: 0
      };
    }
    
    const debts = await Debt.find({ 
      user: new mongoose.Types.ObjectId(userId),
      status: 'active',
      isActive: true
    });
    
    const monthlyDebtPayments = debts.reduce((sum, debt) => sum + debt.monthlyPayment, 0);
    const ratio = (monthlyDebtPayments / monthlyIncome) * 100;
    
    let status = 'good';
    if (ratio > 43) status = 'critical';
    else if (ratio > 36) status = 'high';
    else if (ratio > 20) status = 'moderate';
    
    return {
      ratio: Math.round(ratio * 100) / 100,
      status,
      monthlyDebtPayments: Math.round(monthlyDebtPayments * 100) / 100,
      monthlyIncome: Math.round(monthlyIncome * 100) / 100,
      remainingIncome: Math.round((monthlyIncome - monthlyDebtPayments) * 100) / 100
    };
  }

  /**
   * Get debt summary dashboard data
   */
  async getDebtSummary(userId) {
    const debts = await Debt.find({ 
      user: new mongoose.Types.ObjectId(userId),
      isActive: true
    });
    
    const activeDebts = debts.filter(d => d.status === 'active');
    const paidOffDebts = debts.filter(d => d.status === 'paid_off');
    
    const totalPrincipal = debts.reduce((sum, d) => sum + d.principalAmount, 0);
    const totalCurrentBalance = activeDebts.reduce((sum, d) => sum + d.currentBalance, 0);
    const totalPaid = debts.reduce((sum, d) => sum + d.totalPaid, 0);
    const totalInterestPaid = debts.reduce((sum, d) => sum + d.totalInterestPaid, 0);
    
    const monthlyPayments = activeDebts.reduce((sum, d) => sum + d.monthlyPayment, 0);
    
    // Calculate weighted average interest rate
    const weightedInterestRate = activeDebts.length > 0
      ? activeDebts.reduce((sum, d) => sum + (d.currentBalance * d.interestRate), 0) / totalCurrentBalance
      : 0;
    
    // Group by loan type
    const byType = {};
    debts.forEach(debt => {
      if (!byType[debt.loanType]) {
        byType[debt.loanType] = {
          count: 0,
          totalBalance: 0,
          totalPrincipal: 0,
          monthlyPayment: 0
        };
      }
      byType[debt.loanType].count++;
      byType[debt.loanType].totalBalance += debt.currentBalance;
      byType[debt.loanType].totalPrincipal += debt.principalAmount;
      if (debt.status === 'active') {
        byType[debt.loanType].monthlyPayment += debt.monthlyPayment;
      }
    });
    
    // Get upcoming payments (next 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const upcomingPayments = activeDebts
      .filter(d => d.nextPaymentDate && d.nextPaymentDate <= thirtyDaysFromNow)
      .sort((a, b) => a.nextPaymentDate - b.nextPaymentDate)
      .map(d => ({
        debtId: d._id,
        name: d.name,
        lender: d.lender,
        amount: d.monthlyPayment,
        dueDate: d.nextPaymentDate,
        daysUntil: Math.ceil((d.nextPaymentDate - new Date()) / (1000 * 60 * 60 * 24))
      }));
    
    // Calculate payoff progress
    const payoffProgress = totalPrincipal > 0
      ? Math.round(((totalPrincipal - totalCurrentBalance) / totalPrincipal) * 100)
      : 0;
    
    return {
      overview: {
        totalDebts: debts.length,
        activeDebts: activeDebts.length,
        paidOffDebts: paidOffDebts.length,
        totalPrincipal: Math.round(totalPrincipal * 100) / 100,
        totalCurrentBalance: Math.round(totalCurrentBalance * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
        monthlyPayments: Math.round(monthlyPayments * 100) / 100,
        weightedInterestRate: Math.round(weightedInterestRate * 100) / 100,
        payoffProgress
      },
      byType,
      upcomingPayments,
      highPriorityDebts: activeDebts
        .filter(d => d.priority === 'high' || d.priority === 'critical')
        .map(d => ({
          debtId: d._id,
          name: d.name,
          balance: d.currentBalance,
          interestRate: d.interestRate,
          priority: d.priority
        }))
    };
  }

  /**
   * Record a payment and update debt balance
   */
  async recordPayment(debtId, userId, paymentData) {
    const debt = await Debt.findOne({ _id: debtId, user: userId });
    
    if (!debt) {
      throw new Error('Debt not found');
    }
    
    if (debt.status !== 'active') {
      throw new Error('Cannot make payments on non-active debt');
    }
    
    // Calculate interest portion if not provided
    let { amount, principalPaid, interestPaid } = paymentData;
    
    if (!principalPaid && !interestPaid) {
      const monthlyInterestRate = (debt.interestRate / 100) / 12;
      interestPaid = Math.round(debt.currentBalance * monthlyInterestRate * 100) / 100;
      principalPaid = Math.round((amount - interestPaid) * 100) / 100;
      
      // Ensure principal doesn't exceed balance
      if (principalPaid > debt.currentBalance) {
        principalPaid = debt.currentBalance;
        interestPaid = Math.round((amount - principalPaid) * 100) / 100;
      }
    }
    
    // Add payment to history
    debt.payments.push({
      ...paymentData,
      principalPaid,
      interestPaid
    });
    
    // Update totals
    debt.currentBalance = Math.max(0, debt.currentBalance - principalPaid);
    debt.totalPaid += amount;
    debt.totalInterestPaid += interestPaid;
    debt.lastPaymentDate = new Date();
    
    // Update next payment date (assuming monthly)
    if (debt.nextPaymentDate) {
      const nextDate = new Date(debt.nextPaymentDate);
      nextDate.setMonth(nextDate.getMonth() + 1);
      debt.nextPaymentDate = nextDate;
    }
    
    // Check if paid off
    if (debt.currentBalance <= 0) {
      debt.status = 'paid_off';
      debt.currentBalance = 0;
    }
    
    await debt.save();
    
    return {
      debt,
      payment: debt.payments[debt.payments.length - 1],
      isPaidOff: debt.status === 'paid_off'
    };
  }

  /**
   * Get payment recommendations using avalanche or snowball method
   */
  async getPayoffRecommendations(userId, strategy = 'avalanche') {
    const debts = await Debt.find({ 
      user: new mongoose.Types.ObjectId(userId),
      status: 'active',
      isActive: true
    }).sort({ interestRate: -1 });
    
    if (debts.length === 0) {
      return { strategy, recommendations: [] };
    }
    
    let sortedDebts;
    if (strategy === 'avalanche') {
      // Highest interest rate first
      sortedDebts = [...debts].sort((a, b) => b.interestRate - a.interestRate);
    } else {
      // Snowball: Lowest balance first
      sortedDebts = [...debts].sort((a, b) => a.currentBalance - b.currentBalance);
    }
    
    const recommendations = sortedDebts.map((debt, index) => ({
      debtId: debt._id,
      name: debt.name,
      lender: debt.lender,
      currentBalance: debt.currentBalance,
      interestRate: debt.interestRate,
      monthlyPayment: debt.monthlyPayment,
      priority: index + 1,
      estimatedPayoffDate: debt.estimatedPayoffDate,
      interestSaved: strategy === 'avalanche' 
        ? this.calculateInterestSaved(debt, sortedDebts, index)
        : null
    }));
    
    return {
      strategy,
      strategyDescription: strategy === 'avalanche' 
        ? 'Pay off highest interest debts first to minimize total interest paid'
        : 'Pay off smallest debts first for quick wins and motivation',
      recommendations
    };
  }

  /**
   * Calculate interest saved by prioritizing a debt
   */
  calculateInterestSaved(debt, allDebts, priority) {
    // Simplified calculation - assumes extra payments go to priority debt
    const monthlyRate = (debt.interestRate / 100) / 12;
    const monthsFaster = priority === 0 ? 6 : 0; // Rough estimate
    return Math.round(debt.currentBalance * monthlyRate * monthsFaster * 100) / 100;
  }

  /**
   * Get debts needing attention (overdue, high interest, etc.)
   */
  async getDebtsNeedingAttention(userId) {
    const now = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    
    const debts = await Debt.find({ 
      user: new mongoose.Types.ObjectId(userId),
      status: 'active',
      isActive: true
    });
    
    const attentionNeeded = [];
    
    debts.forEach(debt => {
      // Overdue payments
      if (debt.nextPaymentDate && debt.nextPaymentDate < now) {
        attentionNeeded.push({
          debtId: debt._id,
          name: debt.name,
          type: 'overdue',
          severity: 'high',
          message: `Payment overdue by ${Math.abs(debt.daysUntilPayment)} days`,
          action: 'Make payment immediately'
        });
      }
      // Upcoming payments (within 3 days)
      else if (debt.nextPaymentDate && debt.nextPaymentDate <= threeDaysFromNow) {
        attentionNeeded.push({
          debtId: debt._id,
          name: debt.name,
          type: 'upcoming',
          severity: 'medium',
          message: `Payment due in ${debt.daysUntilPayment} days`,
          action: 'Prepare payment'
        });
      }
      
      // High interest rate (above 15%)
      if (debt.interestRate > 15) {
        attentionNeeded.push({
          debtId: debt._id,
          name: debt.name,
          type: 'high_interest',
          severity: 'medium',
          message: `High interest rate: ${debt.interestRate}%`,
          action: 'Consider refinancing or paying off early'
        });
      }
      
      // Low progress after 1 year
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      if (debt.startDate < oneYearAgo && debt.progressPercentage < 10) {
        attentionNeeded.push({
          debtId: debt._id,
          name: debt.name,
          type: 'low_progress',
          severity: 'low',
          message: 'Less than 10% paid off after 1 year',
          action: 'Review payment strategy'
        });
      }
    });
    
    return attentionNeeded.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Consolidate multiple debts into one
   */
  async consolidateDebts(debtIds, userId, consolidationData) {
    const debts = await Debt.find({
      _id: { $in: debtIds },
      user: userId,
      status: 'active'
    });
    
    if (debts.length < 2) {
      throw new Error('At least 2 active debts required for consolidation');
    }
    
    const totalBalance = debts.reduce((sum, d) => sum + d.currentBalance, 0);
    const totalMonthlyPayment = debts.reduce((sum, d) => sum + d.monthlyPayment, 0);
    
    // Mark original debts as refinanced
    await Debt.updateMany(
      { _id: { $in: debtIds } },
      { status: 'refinanced', isActive: false }
    );
    
    // Create new consolidated debt
    const consolidatedDebt = new Debt({
      user: userId,
      name: consolidationData.name || 'Consolidated Loan',
      lender: consolidationData.lender,
      loanType: consolidationData.loanType || 'personal',
      principalAmount: totalBalance,
      currentBalance: totalBalance,
      interestRate: consolidationData.interestRate,
      monthlyPayment: consolidationData.monthlyPayment || totalMonthlyPayment,
      startDate: new Date(),
      maturityDate: consolidationData.maturityDate,
      notes: `Consolidated from: ${debts.map(d => d.name).join(', ')}`,
      tags: ['consolidated']
    });
    
    await consolidatedDebt.save();
    
    return {
      consolidatedDebt,
      originalDebts: debts.map(d => d._id),
      savings: {
        oldMonthlyPayment: totalMonthlyPayment,
        newMonthlyPayment: consolidatedDebt.monthlyPayment,
        monthlySavings: totalMonthlyPayment - consolidatedDebt.monthlyPayment
      }
    };
  }
}

module.exports = new DebtService();
