# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability within ally, please send an email to the maintainer. All security vulnerabilities will be promptly addressed.

**Please do not open public issues for security vulnerabilities.**

### What to Include

- Type of vulnerability
- Full path to affected files
- Step-by-step instructions to reproduce
- Proof-of-concept or exploit code (if possible)
- Impact assessment

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: Depends on severity
  - Critical: 1-7 days
  - High: 7-14 days
  - Medium: 14-30 days
  - Low: 30-90 days

## Security Best Practices

When using ally:

### CLI Usage

- **URL Validation**: The `crawl` and `tree` commands validate URLs and block private IP ranges by default
- **Rate Limiting**: Built-in retry logic with exponential backoff prevents overwhelming servers
- **Sandboxed Browser**: All scans run in headless Chrome/Firefox with security flags enabled

### Scan Results

- Scan results are stored locally in `.ally/` directory
- No data is sent to external servers (except when using Copilot CLI features)
- Sensitive data in scan results should be excluded via `.ally/config.json`

### CI/CD Integration

When using the GitHub Action:

```yaml
- uses: forbiddenlink/ally@v1
  with:
    path: ./src
    threshold: 0
```

- Use the `threshold` parameter to fail builds on violations
- Store scan results as artifacts for audit trails
- Review reports before making them public (may contain internal URLs)

### MCP Server

The MCP server:

- Only analyzes files in the project directory
- Does not make external network requests
- Caches results in memory (no persistent storage)
- Runs as a subprocess with stdio transport

## Dependency Management

- All dependencies are audited with `npm audit`
- Automated security updates via Dependabot (if configured)
- Regular dependency updates to maintain security posture

## Known Limitations

1. **Browser Automation**: Uses Puppeteer/Playwright which downloads Chrome/Firefox - ensure trusted sources
2. **File System Access**: Has read/write access to scanned directories - review `.ally/config.json` ignore patterns
3. **External URLs**: URL scanning may trigger rate limits or security alerts on target servers

## Disclosure Policy

When we receive a security report:

1. Confirm the vulnerability
2. Determine severity using CVSS
3. Develop and test fix
4. Release patch within timeline above
5. Publish security advisory
6. Credit reporter (if desired)

## Security Updates

Security updates are released as:

- Patch versions (1.0.x) for security fixes
- Immediate npm publish for critical vulnerabilities
- GitHub Security Advisory for high/critical issues

Subscribe to releases on GitHub to be notified of security updates.
