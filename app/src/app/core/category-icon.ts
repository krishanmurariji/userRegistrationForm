/** Picks a duotone icon for a category from its name, so a category without a photo still looks right. */
const rules: [RegExp, string][] = [
  [/\boils?\b|ghee/i, 'drop'],
  [/masala|spice/i, 'pepper'],
  [/dairy|milk|curd|paneer|butter/i, 'cow'],
  [/cheese/i, 'cheese'],
  [/egg/i, 'egg'],
  [/vegetable|sabzi|veggie|veg\b/i, 'carrot'],
  [/fruit/i, 'orange'],
  [/bread|bakery|bun|cake/i, 'bread'],
  [/staple|grain|atta|flour|rice|dal|pulse|cereal/i, 'grains'],
  [/oil|sauce|jar|pickle|jam|spread|masala|spice/i, 'jar'],
  [/snack|biscuit|cookie|namkeen|chips|munch/i, 'cookie'],
  [/sweet|chocolate|candy|dessert|ice/i, 'ice-cream'],
  [/tea|coffee|beverage|drink|juice|cold/i, 'coffee'],
  [/meat|chicken|fish|seafood/i, 'fish'],
  [/personal|beauty|care|soap|shampoo|bath|hygiene/i, 'hand-soap'],
  [/clean|household|home|detergent|laundry/i, 'spray-bottle'],
  [/baby|kid|infant/i, 'baby'],
  [/pet|dog|cat/i, 'dog'],
  [/medicine|pharma|health|wellness/i, 'pill'],
  [/frozen|ready|instant|noodle|pasta|pizza/i, 'bowl-food'],
  [/plant|garden/i, 'plant'],
];

export function categoryIcon(name: string): string {
  return rules.find(([pattern]) => pattern.test(name))?.[1] ?? 'basket';
}
