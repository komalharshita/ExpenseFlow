# Zero-Knowledge Encrypted Vault & Deterministic PII Masking

## 🚀 Overview
Issue #679 implements an enterprise-grade security layer designed for high-sensitivity financial environments. It replaces standard plaintext storage with a **Zero-Knowledge Architecture**, ensuring that even database administrators cannot read sensitive user data.

## 🏗️ Technical Architecture

### 1. Zero-Knowledge Encryption (`services/vaultService.js`)
- **User-Side Secrets**: Encryption keys are derived using PBKDF2 from a secret provided by the user.
- **Root of Trust**: The system never stores the vault secret. It only stores a unique **Salt** (`models/VaultMetadata.js`) used to derive the encryption key on-the-fly.
- **AES-256-GCM**: Use of Galois/Counter Mode ensures both **Confidentiality** and **Authenticity**. Any tampering with the ciphertext will cause decryption to fail.

### 2. Transparent Interception (`middleware/encryptionInterceptor.js`)
The system provides a seamless experience for end-users:
- **Auto-Seal**: When a user submits a transaction with the metadata header `x-vault-secret`, the interceptor automatically seals sensitive fields (`description`, `merchant`, `notes`) before they ever touch the database.
- **Auto-Unseal**: During retrieval, if the correct secret header is provided, the data is decrypted in memory before being sent to the client.

### 3. Deterministic PII Masking (`services/maskingEngine.js`)
For logs, telemetry, and external exports, a secondary privacy layer is applied:
- **Redaction**: Automatically flags and hides emails, phone numbers, and full credit card numbers.
- **Pattern Matching**: Uses optimized RegEx engines to identify PII across nested object structures.

### 4. Schema Evolution (`models/Transaction.js`)
Sensitive fields now support binary-formatted ciphertext. The schema includes `encryptedFields` metadata to track which segments of a document are protected, allowing for partial encryption or future migration.

## 🛠️ Security Guidelines

### Initialization
Users must first initialize their vault:
```http
POST /api/security/vault/init
{ "vaultSecret": "your-strong-passphrase" }
```

### Usage
Every subsequent request that requires access to encrypted data must include the secret:
`X-Vault-Secret: your-strong-passphrase`

## ✅ Implementation Checklist
- [x] AES-256-GCM cryptographic primitives.
- [x] PBKDF2 key derivation with unique salts.
- [x] Zero-Knowledge metadata store.
- [x] Field-level mutation interceptor.
- [x] Multi-pattern PII masking engine.
- [x] Security test suite for authentication tag validation.

## 🧪 Security Testing
Run the vault penetration tests:
```bash
npx mocha tests/vault.test.js
```
