// For @Transform: text fields lose their surrounding spaces before they are validated.
export const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
