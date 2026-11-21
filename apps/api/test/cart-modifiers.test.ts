import { describe, it, expect } from 'vitest';

interface ModifierOption {
  id: string;
  name: string;
  pricePaise: number;
}

interface ModifierGroup {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  options: ModifierOption[];
}

function validateCartItemModifiers(
  itemName: string,
  groups: ModifierGroup[],
  selectedOptionIds: string[]
): { valid: boolean; error?: string } {
  const allValidOptionIds = groups.flatMap((g) => g.options.map((o) => o.id));

  // Check rogue options
  for (const optId of selectedOptionIds) {
    if (!allValidOptionIds.includes(optId)) {
      return { valid: false, error: `Modifier option does not belong to dish '${itemName}'` };
    }
  }

  // Check each group constraint
  for (const group of groups) {
    const groupOptIds = group.options.map((o) => o.id);
    const countInGroup = selectedOptionIds.filter((id) => groupOptIds.includes(id)).length;

    if (countInGroup < group.minSelections) {
      return {
        valid: false,
        error: `Item '${itemName}' requires at least ${group.minSelections} selection for '${group.name}'`,
      };
    }

    if (countInGroup > group.maxSelections) {
      return {
        valid: false,
        error: `Item '${itemName}' allows at most ${group.maxSelections} selection(s) for '${group.name}'`,
      };
    }
  }

  return { valid: true };
}

describe('Cart Modifier Group Validation Logic', () => {
  const paniPuriGroups: ModifierGroup[] = [
    {
      id: 'grp-spice',
      name: 'Spice Level',
      minSelections: 1,
      maxSelections: 1,
      options: [
        { id: 'opt-medium', name: 'Medium Spicy', pricePaise: 0 },
        { id: 'opt-teekha', name: 'Teekha / Extra Spicy', pricePaise: 0 },
      ],
    },
    {
      id: 'grp-addons',
      name: 'Extra Add-ons',
      minSelections: 0,
      maxSelections: 2,
      options: [
        { id: 'opt-extra-boondi', name: 'Extra Boondi', pricePaise: 1500 },
        { id: 'opt-extra-puri', name: 'Extra Puris (4 pcs)', pricePaise: 2000 },
      ],
    },
  ];

  it('rejects when mandatory modifier group has zero selections', () => {
    const result = validateCartItemModifiers('Pani Puri', paniPuriGroups, []);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/requires at least 1 selection for 'Spice Level'/);
  });

  it('rejects when selections exceed maximum allowed for a group', () => {
    // Both options chosen in a single-choice (max=1) group
    const result = validateCartItemModifiers('Pani Puri', paniPuriGroups, [
      'opt-medium',
      'opt-teekha',
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/allows at most 1 selection\(s\) for 'Spice Level'/);
  });

  it('rejects rogue modifier options belonging to a different dish', () => {
    const result = validateCartItemModifiers('Pani Puri', paniPuriGroups, [
      'opt-medium',
      'opt-butter-cube', // Belongs to Pav Bhaji, not Pani Puri!
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/does not belong to dish 'Pani Puri'/);
  });

  it('accepts valid selections meeting all group rules', () => {
    const result = validateCartItemModifiers('Pani Puri', paniPuriGroups, [
      'opt-medium',
      'opt-extra-boondi',
    ]);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
