// Patient catalogs (spec 104 FR-002): avatars (with image), diagnoses and conditions.
export type CatalogKind = 'avatars' | 'diagnoses' | 'conditions';
export const catalogKinds: CatalogKind[] = ['avatars', 'diagnoses', 'conditions'];
// Entity name in the audit log.
export const catalogEntity = { avatars: 'Avatar', diagnoses: 'Diagnosis', conditions: 'Condition' } as const;

export interface CatalogItemProps {
  id: string;
  name: string;
  imagePath: string | null; // avatars only: path in the bucket
  active: boolean;
}

export type CatalogItemChanges = Partial<Pick<CatalogItemProps, 'name' | 'active'>>;

export interface CatalogItem extends Readonly<CatalogItemProps> {}
export class CatalogItem {
  private constructor(props: CatalogItemProps) {
    Object.assign(this, props);
  }

  static reconstitute(props: CatalogItemProps) {
    return new CatalogItem(props);
  }

  static create(name: string, imagePath: string | null = null) {
    return new CatalogItem({ id: crypto.randomUUID(), name: name.trim(), imagePath, active: true });
  }

  // Returns the fields that really changed.
  edit(changes: CatalogItemChanges) {
    const next: CatalogItemChanges = { name: changes.name?.trim(), active: changes.active };
    const changed = (Object.keys(next) as (keyof CatalogItemChanges)[]).filter((key) => next[key] !== undefined && next[key] !== this[key]);
    Object.assign(this, Object.fromEntries(changed.map((key) => [key, next[key]])));
    return changed;
  }

  // Deleting something a patient uses would break it: it is deactivated instead (agreed 2026-10-23).
  deactivate() {
    Object.assign(this, { active: false });
  }

  toSnapshot(): CatalogItemProps {
    return { ...this };
  }
}
