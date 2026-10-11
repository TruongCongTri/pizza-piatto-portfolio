/* locale-independent menu data, transcribed from the printed menus in
   /public/dining-menu; names, descriptions and taglines live in the
   dictionaries under `diningMenu.categories`. Tags: "veg" (vegetarian, the
   leaf on the printed menu) and "spicy" (the chilli). `image` is a photo of
   the dish from the shop's Facebook posts, shown on hover on /menu; items
   without one have no matching photo yet */
export const diningMenu = [
  {
    id: "pizza",
    image: "/dining-menu/dining-menu-pizza.jpg",
    items: [
      {
        id: "margherita",
        size: "30 cm",
        price: "180,000 đ",
        tags: ["veg"],
        image: "/menu-items/pizza-margherita.jpg",
      },
      {
        id: "veggieLover",
        size: "30 cm",
        price: "200,000 đ",
        tags: ["veg"],
        image: "/menu-items/pizza-veggieLover.jpg",
      },
      {
        id: "fungus",
        size: "30 cm",
        price: "220,000 đ",
        tags: ["veg"],
        image: "/menu-items/pizza-fungus.jpg",
      },
      {
        id: "fourCheese",
        size: "30 cm",
        price: "280,000 đ",
        tags: ["veg"],
        image: "/menu-items/pizza-fourCheese.jpg",
      },
      {
        id: "burrata",
        size: "30 cm",
        price: "290,000 đ",
        tags: ["veg"],
        image: "/menu-items/pizza-burrata.jpg",
      },
      {
        id: "seafoodLover",
        size: "30 cm",
        price: "280,000 đ",
        tags: ["spicy"],
        image: "/menu-items/pizza-seafoodLover.jpg",
      },
    ],
  },

  {
    id: "meatPizza",
    image: "/dining-menu/dining-menu-general.jpg",
    items: [
      {
        id: "spicySalami",
        size: "30 cm",
        price: "200,000 đ",
        tags: ["spicy"],
        image: "/menu-items/meatPizza-spicySalami.jpg",
      },
      {
        id: "capricciosa",
        size: "30 cm",
        price: "230,000 đ",
        image: "/menu-items/meatPizza-capricciosa.jpg",
      },
      {
        id: "meatLover",
        size: "30 cm",
        price: "240,000 đ",
        tags: ["spicy"],
        image: "/menu-items/meatPizza-meatLover.jpg",
      },
      {
        id: "surfTurf",
        size: "30 cm",
        price: "240,000 đ",
        image: "/menu-items/meatPizza-surfTurf.jpg",
      },
      {
        id: "heoQuay",
        size: "30 cm",
        price: "240,000 đ",
        image: "/menu-items/meatPizza-heoQuay.jpg",
      },
      { id: "bolognese", size: "30 cm", price: "220,000 đ" },
    ],
  },

  {
    id: "salad",
    image: "/dining-menu/dining-menu-salad.jpg",
    items: [{ id: "burrataSalad", price: "230,000 đ", tags: ["veg"] }],
  },

  {
    id: "pasta",
    image: "/dining-menu/dining-menu-pasta.jpg",
    items: [
      {
        id: "creamyMushroom",
        price: "140,000 đ",
        tags: ["veg"],
        image: "/menu-items/pasta-creamyMushroom.jpg",
      },
      {
        id: "veggie",
        price: "120,000 đ",
        tags: ["veg"],
        image: "/menu-items/pasta-veggie.jpg",
      },
      { id: "bolognese", price: "140,000 đ" },
      { id: "seafood", price: "150,000 đ" },
    ],
  },

  {
    id: "drinks",
    image: "/dining-menu/dining-menu-drink.jpg",
    items: [
      { id: "dasani", price: "20,000 đ" },
      { id: "sprite", price: "20,000 đ" },
      { id: "pepsiLight", price: "20,000 đ" },
      { id: "gingerAle", price: "20,000 đ" },
    ],
  },
];

/* merge the dictionary text (dict.diningMenu) into the menu data */
export function localizeDiningMenu(t) {
  return diningMenu.map((category) => {
    const text = t.categories[category.id];

    return {
      ...category,
      category: text.name,
      tagline: text.tagline,
      items: category.items.map((item) => ({
        ...item,
        ...text.items[item.id],
      })),
    };
  });
}
