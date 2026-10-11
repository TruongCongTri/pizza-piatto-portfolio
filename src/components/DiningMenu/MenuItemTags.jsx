import { PiLeaf, PiLeafFill, PiPepper, PiPepperFill } from "react-icons/pi";

import "./MenuItemTags.css";

/* leaf / chilli markers, as on the printed menu; `outline` matches its
   line-drawn icons */
const TAG_ICONS = {
  fill: { veg: PiLeafFill, spicy: PiPepperFill },
  outline: { veg: PiLeaf, spicy: PiPepper },
};

export default function MenuItemTags({ tags, labels, variant = "fill" }) {
  if (!tags?.length) return null;

  return (
    <span className="menu-item-tags">
      {tags.map((tag) => {
        const Icon = TAG_ICONS[variant][tag];
        return (
          <span key={tag} className={`menu-item-tag ${tag}`} title={labels[tag]}>
            <Icon aria-hidden="true" />
            <span className="visually-hidden">{labels[tag]}</span>
          </span>
        );
      })}
    </span>
  );
}
