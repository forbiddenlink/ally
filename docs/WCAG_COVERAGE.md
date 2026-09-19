# WCAG Coverage Documentation

ally uses **axe-core** (industry standard) to scan for accessibility violations. This document maps ally's detection capabilities to WCAG 2.2 Success Criteria.

## Default Standard: WCAG 2.2 Level AA

ally defaults to `wcag22aa` which includes all Level A and AA criteria from WCAG 2.0, 2.1, and 2.2.

## Supported WCAG Standards

| Standard | Flag | Description |
|----------|------|-------------|
| WCAG 2.0 A | `--standard wcag2a` | Minimum level, most critical issues |
| WCAG 2.0 AA | `--standard wcag2aa` | Common compliance target |
| WCAG 2.0 AAA | `--standard wcag2aaa` | Strictest WCAG 2.0 compliance |
| WCAG 2.1 A | `--standard wcag21a` | Mobile-first additions |
| WCAG 2.1 AA | `--standard wcag21aa` | Common modern compliance target |
| WCAG 2.1 AAA | `--standard wcag21aaa` | Strictest WCAG 2.1 compliance |
| **WCAG 2.2 AA** | `--standard wcag22aa` | **Default** - Current best practice |
| Section 508 | `--standard section508` | US federal requirement |
| Best Practices | `--standard best-practice` | Beyond WCAG requirements |

---

## WCAG 2.2 Coverage by Principle

### 1. Perceivable

| SC | Level | Criterion | ally Detection | Auto-Fix |
|----|-------|-----------|----------------|----------|
| 1.1.1 | A | Non-text Content | ✅ `image-alt`, `input-image-alt`, `svg-img-alt` | ✅ 95% confidence |
| 1.2.1 | A | Audio-only & Video-only | ⚠️ Partial (`video-caption`) | ❌ |
| 1.2.2 | A | Captions (Prerecorded) | ⚠️ Partial (`video-caption`) | ❌ |
| 1.2.3 | A | Audio Description | ❌ Manual review required | ❌ |
| 1.2.4 | AA | Captions (Live) | ❌ Manual review required | ❌ |
| 1.2.5 | AA | Audio Description (Prerecorded) | ❌ Manual review required | ❌ |
| 1.3.1 | A | Info and Relationships | ✅ `label`, `list`, `listitem`, `region`, `landmark-*` | ✅ 85% |
| 1.3.2 | A | Meaningful Sequence | ⚠️ Limited (manual review) | ❌ |
| 1.3.3 | A | Sensory Characteristics | ❌ Manual review required | ❌ |
| 1.3.4 | AA | Orientation | ⚠️ Partial (`meta-viewport`) | ✅ 95% |
| 1.3.5 | AA | Identify Input Purpose | ✅ `autocomplete-valid` | ✅ 80% |
| 1.3.6 | AAA | Identify Purpose | ❌ Requires semantic analysis | ❌ |
| 1.4.1 | A | Use of Color | ⚠️ Partial (`link-in-text-block`) | ✅ 80% |
| 1.4.2 | A | Audio Control | ❌ Manual review required | ❌ |
| 1.4.3 | AA | Contrast (Minimum) | ✅ `color-contrast` | ⚠️ 50% |
| 1.4.4 | AA | Resize Text | ✅ `meta-viewport` | ✅ 95% |
| 1.4.5 | AA | Images of Text | ❌ Manual review required | ❌ |
| 1.4.10 | AA | Reflow | ❌ Manual review required | ❌ |
| 1.4.11 | AA | Non-text Contrast | ⚠️ Limited (button borders, etc.) | ❌ |
| 1.4.12 | AA | Text Spacing | ❌ Manual review required | ❌ |
| 1.4.13 | AA | Content on Hover/Focus | ❌ Manual review required | ❌ |

### 2. Operable

| SC | Level | Criterion | ally Detection | Auto-Fix |
|----|-------|-----------|----------------|----------|
| 2.1.1 | A | Keyboard | ⚠️ Partial (`focusable`, `tabindex`) | ✅ 95% |
| 2.1.2 | A | No Keyboard Trap | ⚠️ Limited | ❌ |
| 2.1.4 | A | Character Key Shortcuts | ❌ Manual review required | ❌ |
| 2.2.1 | A | Timing Adjustable | ❌ Manual review required | ❌ |
| 2.2.2 | A | Pause, Stop, Hide | ❌ Manual review required | ❌ |
| 2.3.1 | A | Three Flashes | ❌ Manual review required | ❌ |
| 2.4.1 | A | Bypass Blocks | ✅ `bypass`, `frame-title` | ✅ 60-90% |
| 2.4.2 | A | Page Titled | ✅ `document-title` | ✅ 90% |
| 2.4.3 | A | Focus Order | ✅ `focus-order-semantics` | ✅ 95% |
| 2.4.4 | A | Link Purpose (In Context) | ✅ `link-name` | ✅ 80% |
| 2.4.5 | AA | Multiple Ways | ❌ Manual review required | ❌ |
| 2.4.6 | AA | Headings and Labels | ✅ `heading-order`, `empty-heading` | ✅ 65-70% |
| 2.4.7 | AA | Focus Visible | ⚠️ Partial (`focus-visible`) | ⚠️ 55% |
| 2.4.11 | AA | Focus Not Obscured (Minimum) | ❌ New in 2.2, limited support | ❌ |
| 2.5.1 | A | Pointer Gestures | ❌ Manual review required | ❌ |
| 2.5.2 | A | Pointer Cancellation | ❌ Manual review required | ❌ |
| 2.5.3 | A | Label in Name | ⚠️ Partial (`label-title-only`) | ❌ |
| 2.5.4 | A | Motion Actuation | ❌ Manual review required | ❌ |
| 2.5.7 | AA | Dragging Movements | ❌ New in 2.2, manual review | ❌ |
| 2.5.8 | AA | Target Size (Minimum) | ⚠️ Partial (`target-size`) | ❌ |

### 3. Understandable

| SC | Level | Criterion | ally Detection | Auto-Fix |
|----|-------|-----------|----------------|----------|
| 3.1.1 | A | Language of Page | ✅ `html-has-lang`, `html-lang-valid` | ✅ 99% |
| 3.1.2 | AA | Language of Parts | ✅ `valid-lang` | ✅ 90% |
| 3.2.1 | A | On Focus | ❌ Manual review required | ❌ |
| 3.2.2 | A | On Input | ❌ Manual review required | ❌ |
| 3.2.3 | AA | Consistent Navigation | ❌ Manual review required | ❌ |
| 3.2.4 | AA | Consistent Identification | ❌ Manual review required | ❌ |
| 3.2.6 | AA | Consistent Help | ❌ New in 2.2, manual review | ❌ |
| 3.3.1 | A | Error Identification | ❌ Manual review required | ❌ |
| 3.3.2 | A | Labels or Instructions | ✅ `label` | ✅ 85% |
| 3.3.3 | AA | Error Suggestion | ❌ Manual review required | ❌ |
| 3.3.4 | AA | Error Prevention | ❌ Manual review required | ❌ |
| 3.3.7 | A | Redundant Entry | ❌ New in 2.2, manual review | ❌ |
| 3.3.8 | AA | Accessible Authentication (Minimum) | ❌ New in 2.2, manual review | ❌ |

### 4. Robust

| SC | Level | Criterion | ally Detection | Auto-Fix |
|----|-------|-----------|----------------|----------|
| 4.1.1 | A | Parsing | ⚠️ Deprecated in WCAG 2.2 | N/A |
| 4.1.2 | A | Name, Role, Value | ✅ `button-name`, `aria-*` rules | ✅ 75-90% |
| 4.1.3 | AA | Status Messages | ⚠️ Partial (`aria-live-region`) | ❌ |

---

## Coverage Summary

| Category | Detectable | Auto-Fixable |
|----------|------------|--------------|
| **Level A** | ~65% | ~45% |
| **Level AA** | ~50% | ~30% |
| **Level AAA** | ~25% | ~15% |

### Why Not 100%?

Many WCAG criteria require **human judgment** that automated tools cannot provide:

1. **Content quality** - Is alt text meaningful? Is heading text descriptive?
2. **User experience** - Is the focus order logical? Is navigation consistent?
3. **Dynamic behavior** - Does timing pause? Do animations respect preferences?
4. **Context** - Does color convey information beyond other cues?

**ally helps you find the ~50% of issues that are automatically detectable**, freeing you to focus manual review on the other ~50%.

---

## Regulatory Compliance

### April 2026 ADA Deadline

The US Department of Justice published rules requiring **WCAG 2.1 Level AA** compliance for:
- State/local governments serving 50,000+ people: **April 24, 2026**
- Smaller entities: April 26, 2027

ally's default `wcag22aa` standard exceeds this requirement.

### European Accessibility Act

The **European Accessibility Act (EAA)** requires WCAG 2.1 Level AA compliance for products and services in the EU market, effective **June 28, 2025**.

ally fully supports this standard via `--standard wcag21aa` or the default `wcag22aa`.

---

## Using ally for Compliance

```bash
# Scan against WCAG 2.1 AA (ADA/EAA requirement)
ally scan --standard wcag21aa

# Scan against WCAG 2.2 AA (current best practice, default)
ally scan

# Generate compliance report
ally report --format html

# Set baseline and track progress
ally scan --baseline
ally scan --compare-baseline --fail-on-regression
```

---

## Related Resources

- [WCAG 2.2 Specification](https://www.w3.org/TR/WCAG22/)
- [axe-core Rules](https://dequeuniversity.com/rules/axe/4.8)
- [ADA Title II Final Rule](https://www.ada.gov/resources/web-guidance/)
- [European Accessibility Act](https://ec.europa.eu/social/main.jsp?catId=1202)
