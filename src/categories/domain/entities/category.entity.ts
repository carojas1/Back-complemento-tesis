export interface CategoryProps {
  id: string;
  name: string;
  color: string; // #RRGGBB
  sortOrder: number;
  active: boolean;
}

export type CategoryChanges = Partial<Pick<CategoryProps, 'name' | 'color' | 'sortOrder' | 'active'>>;

// Vocabulary catalog category (spec 105 FR-005). Never deleted: it is deactivated.
export interface Category extends Readonly<CategoryProps> {}
export class Category {
  private constructor(props: CategoryProps) {
    Object.assign(this, props);
  }

  static reconstitute(props: CategoryProps) {
    return new Category(props);
  }

  static create(input: { name: string; color: string; sortOrder?: number }) {
    return new Category({
      id: crypto.randomUUID(),
      name: input.name.trim(),
      color: input.color.toUpperCase(),
      sortOrder: input.sortOrder ?? 0,
      active: true,
    });
  }

  // Returns the fields that really changed (to avoid saving or auditing for nothing).
  edit(changes: CategoryChanges) {
    // Only the editable fields: anything else in `changes` is ignored.
    const next: CategoryChanges = {
      name: changes.name?.trim(),
      color: changes.color?.toUpperCase(),
      sortOrder: changes.sortOrder,
      active: changes.active,
    };
    const changed = (Object.keys(next) as (keyof CategoryChanges)[]).filter((key) => next[key] !== undefined && next[key] !== this[key]);
    Object.assign(this, Object.fromEntries(changed.map((key) => [key, next[key]])));
    return changed;
  }

  toSnapshot(): CategoryProps {
    return { ...this };
  }
}
