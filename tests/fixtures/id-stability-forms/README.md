# ID Stability Forms Test Fixture

## Overview
Demonstrates critical ID stability rules for forms where host IDs are retained and page references are automatically rewritten to maintain functionality.

## Key Features Tested

### ID Stability Principle
- Host IDs always retained for stability
- Page IDs ignored (prevents broken references)
- Ensures forms, labels, and ARIA attributes continue working

### Automatic Reference Rewriting
Page references get rewritten to match retained host IDs:
- `for="custom-email"` → `for="user-email"`
- `for="custom-name"` → `for="user-name"`
- `for="custom-newsletter"` → `for="newsletter-opt"`
- `aria-describedby="custom-email-help custom-email-error"` → `aria-describedby="email-help email-error"`
- `href="#custom-terms-title"` → `href="#terms-title"`

### New Elements Keep Page IDs
Elements that don't exist in host use page IDs:
- Phone field keeps `id="custom-phone"`
- SMS checkbox keeps `id="custom-sms"`

### Form Functionality Preserved
- Form ID stability (`id="layout-signup"`)
- Fieldset IDs retained (`id="personal-info"`, `id="preferences"`)
- All label-input associations maintained
- ARIA relationships preserved

## Why ID Stability Matters

1. **Prevents broken forms**: Labels stay connected to inputs
2. **Maintains accessibility**: ARIA relationships preserved
3. **Avoids ID collisions**: No duplicate IDs in final DOM
4. **Third-party compatibility**: External scripts can rely on stable IDs

## Expected Behavior
1. All host IDs retained in merged output
2. Page `for` and `aria-*` attributes rewritten
3. New page elements keep their IDs
4. Form remains fully functional

## DOM Cascade Spec Reference
- Section: "Accessibility & ID Handling"
- ID stability exception to "page wins" rule
- Automatic reference rewriting for `for`, `aria-*` attributes