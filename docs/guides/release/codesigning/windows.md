<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Nexus Engine contributors -->

# Codesigning — Windows (Authenticode)

Sign every `.exe`, `.msi`, `.msix`, `.dll`. Unsigned = SmartScreen scary prompt = install conversion drops ~50%. EV cert = instant SmartScreen trust; OV cert = trust earned over ~5000 installs.

Authoritative:
- https://learn.microsoft.com/windows/win32/seccrypto/cryptography-tools
- https://learn.microsoft.com/windows/security/threat-protection/microsoft-defender-smartscreen/

---

## Cert types

| Type | SmartScreen | Cost | EV hardware token? |
|------|------------|------|-------------------|
| OV (Organization Validated) | Earns trust gradually | $200-400/yr | no |
| EV (Extended Validation) | Instant trust | $300-700/yr | **yes — physical USB token or HSM required** |
| Self-signed | Always warned | $0 | n/a — not for distribution |

EV is the right answer for any commercial release. The hardware token requirement is annoying but unlocks the SmartScreen instant-trust.

---

## Cert vendors

| Vendor | Notes |
|--------|-------|
| Certum | Often cheapest EV (~€300/yr). Polish CA, widely accepted. https://shop.certum.eu |
| SSL.com | Good EV + OV pricing. https://www.ssl.com/code-signing/ |
| DigiCert | Premium, slow but reliable. https://www.digicert.com |
| Sectigo | Decent pricing. https://sectigo.com |
| GlobalSign | Premium. https://www.globalsign.com |
| Azure Trusted Signing | Cloud-only EV alternative (no USB token). https://learn.microsoft.com/azure/trusted-signing/ |

**Azure Trusted Signing** is the modern path for CI — no hardware token, fully cloud, EV-equivalent reputation. Worth strong consideration vs traditional CA + token.

---

## Get the cert

OV: vendor validates company → emails `.pfx` (PKCS12) file.
EV: vendor validates company more deeply → ships physical USB token (SafeNet eToken, YubiKey FIPS, etc.) with cert provisioned.

Store the PFX or token PIN securely. → `docs/guides/deploy/secrets.md`.

---

## Sign with `signtool.exe`

```powershell
signtool sign /fd SHA256 /a /tr http://timestamp.digicert.com /td SHA256 \
  /f cert.pfx /p $env:CERT_PASSWORD \
  YourGame.exe YourGameSetup.exe
```

Flags explained:
- `/fd SHA256` — digest algorithm (required; SHA1 deprecated).
- `/tr` — RFC 3161 timestamp server (signature stays valid after cert expires).
- `/td SHA256` — timestamp digest.
- `/f cert.pfx /p PASS` — PFX file + password.

Verify:

```powershell
signtool verify /pa /v YourGame.exe
```

signtool docs: https://learn.microsoft.com/dotnet/framework/tools/signtool-exe

---

## EV token signing in CI

Token requires a smart-card / KSP integration. Approaches:
- **Local Mac/Win build machine with USB token** — works, scales poorly.
- **Azure Key Vault HSM** with imported cert — `AzureSignTool` reads from KV; no token needed.
- **DigiCert KeyLocker / DigiCert ONE** — managed cloud signing.
- **GitHub Actions hosted runner** — cannot use a USB token; must use cloud signing.

`AzureSignTool` (recommended for CI):

```bash
dotnet tool install --global AzureSignTool
AzureSignTool sign -kvu https://nexus-signing.vault.azure.net \
  -kvc nexus-ev-cert \
  -kvm \
  -tr http://timestamp.digicert.com \
  -td sha256 \
  YourGame.exe
```

Auth: managed identity, service principal, or `--azure-identity-username`. Docs: https://github.com/vcsjones/AzureSignTool

---

## Azure Trusted Signing (newest path)

Microsoft's managed EV-equivalent. No CA contract; cert issued by Microsoft.

```bash
# install client
dotnet tool install --global sign --version 0.9.1-beta.24123.6

sign code trusted-signing YourGame.exe \
  --trusted-signing-account nexus \
  --trusted-signing-certificate-profile production
```

Docs: https://learn.microsoft.com/azure/trusted-signing/
Pricing: ~$10/mo + per-signature (cheap).

---

## SmartScreen reputation

Reputation accrues per:
- Cert subject (the publisher)
- Specific binary hash (each new build is new)

EV: instant publisher trust.
OV: ~5,000 trusted installs before publisher trusted.
Per-binary: every new build starts at zero; published-binary reputation builds via installs.

Microsoft Defender Application Reputation: https://learn.microsoft.com/windows/security/threat-protection/microsoft-defender-smartscreen/

---

## MSIX sign

Same `signtool` flow. Cert subject `CN=` **must exactly match** the `<Identity Publisher="...">` in `Package.appxmanifest`.

```powershell
signtool sign /fd SHA256 /a /f cert.pfx /p $env:CERT_PASSWORD YourGame.msix
```

If mismatch → MSIX install fails. Auto-derive Publisher from cert:

```powershell
$cert = Get-PfxCertificate cert.pfx
$cert.Subject     # use this exact string as <Identity Publisher="...">
```

---

## CI snippet (GitHub Actions, Azure KV)

```yaml
- uses: azure/login@v2
  with:
    creds: ${{ secrets.AZURE_CREDENTIALS }}
- run: |
    dotnet tool install --global AzureSignTool
    AzureSignTool sign \
      -kvu ${{ secrets.KV_URL }} \
      -kvc ${{ secrets.KV_CERT_NAME }} \
      -kvm \
      -tr http://timestamp.digicert.com \
      -td sha256 \
      dist/YourGame.exe dist/YourGameSetup.exe
```

---

## Revocation procedure

Compromised cert:
1. Notify CA → request revocation.
2. CA publishes to CRL/OCSP.
3. Roll all signed binaries via a new cert.
4. Notify users: the prior version is no longer trusted (it stops launching for many).

Mitigate: store the cert in a hardware token / Azure KV HSM. Never as plaintext PFX on a build machine.

→ `docs/guides/deploy/secrets.md` for kill-switch procedure.

---

## Smoke test

```powershell
# verify
signtool verify /pa /v YourGame.exe
# expect "Successfully verified" and SignerCertificate listed

# fresh Windows VM → download → install
# observe SmartScreen: EV = no warning; OV = "More info" → "Run anyway" until rep built
```

---

## Pitfalls

- **Timestamp server reachability** in CI — pick a redundant one (`http://timestamp.digicert.com` works reliably).
- **SHA1 only** signing → modern Windows refuses. Always SHA256.
- **Cert expired without timestamp** → all old binaries become unverified.
- **PFX in repo plaintext** → instant compromise. Use Azure KV / HSM.
- **USB token in CI** → impossible on cloud runners; switch to Azure Trusted Signing or KV HSM.
- **MSIX Publisher mismatch** → install fails silently or with cryptic error.

---

## Cross-links

- macOS notarization → `docs/guides/release/codesigning/macos.md`
- Microsoft Store → `docs/guides/release/microsoft-store.md`
- Steam (Windows binary signing applies) → `docs/guides/release/steam.md`
- Installer authoring → `docs/guides/release/installers.md`
- Secrets / cert storage → `docs/guides/deploy/secrets.md`
