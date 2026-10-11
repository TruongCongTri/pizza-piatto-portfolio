"use client";

import Copy from "../Copy/Copy";
import Photo from "@/components/Photo/Photo";
import { useLocale } from "@/i18n/LocaleProvider";

import "./ImageBanner.css";

/* heading/description fall back to dict.imageBanner */
const ImageBanner = ({
  image = "/image-banner/image-banner.jpg",
  heading,
  description,
}) => {
  const { dict } = useLocale();
  const headingWords = heading ?? dict.imageBanner.heading;
  const text = description ?? dict.imageBanner.description;

  return (
    <section className="image-banner">
      <div className="image-banner-bg">
        <Photo src={image} sizes="100vw" />
      </div>

      <div className="container">
        <Copy type="lines" animateOnScroll>
          {headingWords.map((word, index) => (
            <h4 key={index}>{word}</h4>
          ))}
        </Copy>

        <div className="image-banner-footer">
          <Copy
            type="lines"
            trigger=".image-banner"
            start="top 50%"
            delay={0.5}
          >
            <p>{text}</p>
          </Copy>
        </div>
      </div>
    </section>
  );
};

export default ImageBanner;
