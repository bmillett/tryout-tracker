/**
 * Shared validation logic for team fields.
 * This module has zero runtime dependencies so it can also be tested with plain Node.
 */

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
export const RESERVED_SLUGS = new Set(['api', 't', 'admin', 'assets']);

export interface TeamFields {
  slug?: unknown;
  name?: unknown;
  coach_pin?: unknown;
  mixed_gender?: unknown;
}

export interface ValidationError {
  field: string;
  message: string;
}

/** Validates the slug for create (full rules including uniqueness is checked server-side). */
export function validateSlug(slug: unknown): ValidationError | null {
  if (typeof slug !== 'string' || slug.length === 0) {
    return { field: 'slug', message: 'slug is required and must be a string' };
  }
  if (slug.length < 2 || slug.length > 40) {
    return { field: 'slug', message: 'slug must be between 2 and 40 characters' };
  }
  if (!SLUG_PATTERN.test(slug)) {
    return {
      field: 'slug',
      message: 'slug must contain only lowercase letters, digits, and hyphens, and must start with a letter or digit'
    };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { field: 'slug', message: `"${slug}" is a reserved word and cannot be used as a slug` };
  }
  return null;
}

export function validateName(name: unknown): ValidationError | null {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return { field: 'name', message: 'name is required' };
  }
  if (name.trim().length > 80) {
    return { field: 'name', message: 'name must be 80 characters or fewer' };
  }
  return null;
}

export function validateCoachPin(coach_pin: unknown): ValidationError | null {
  if (typeof coach_pin !== 'string' || coach_pin.length === 0) {
    return { field: 'coach_pin', message: 'coach_pin is required and must be a string' };
  }
  if (!/^\d+$/.test(coach_pin)) {
    return { field: 'coach_pin', message: 'coach_pin must contain digits only' };
  }
  if (coach_pin.length < 4 || coach_pin.length > 8) {
    return { field: 'coach_pin', message: 'coach_pin must be between 4 and 8 digits' };
  }
  return null;
}

export function validateMixedGender(mixed_gender: unknown): ValidationError | null {
  if (typeof mixed_gender !== 'boolean') {
    return { field: 'mixed_gender', message: 'mixed_gender must be a boolean' };
  }
  return null;
}

/** Validate all fields for creating a new team. */
export function validateCreatePayload(body: TeamFields): ValidationError[] {
  const errors: ValidationError[] = [];
  const slugErr = validateSlug(body.slug);
  if (slugErr) errors.push(slugErr);
  const nameErr = validateName(body.name);
  if (nameErr) errors.push(nameErr);
  const pinErr = validateCoachPin(body.coach_pin);
  if (pinErr) errors.push(pinErr);
  const genderErr = validateMixedGender(body.mixed_gender);
  if (genderErr) errors.push(genderErr);
  return errors;
}

/** Validate fields for editing a team (slug is immutable; at least one editable field required). */
export function validateEditPayload(body: Omit<TeamFields, 'slug'>): ValidationError[] {
  const errors: ValidationError[] = [];
  if (body.name !== undefined) {
    const err = validateName(body.name);
    if (err) errors.push(err);
  }
  if (body.coach_pin !== undefined) {
    const err = validateCoachPin(body.coach_pin);
    if (err) errors.push(err);
  }
  if (body.mixed_gender !== undefined) {
    const err = validateMixedGender(body.mixed_gender);
    if (err) errors.push(err);
  }
  if (body.name === undefined && body.coach_pin === undefined && body.mixed_gender === undefined) {
    errors.push({ field: 'body', message: 'at least one of name, coach_pin, or mixed_gender must be provided' });
  }
  return errors;
}
