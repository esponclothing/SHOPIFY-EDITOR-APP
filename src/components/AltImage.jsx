/**
 * AltImage – drop-in replacement for <img>.
 * Generates a SEO-rich alt tag via the Groq vision API on mount,
 * then renders the image with the generated alt.
 *
 * Props:
 *   src          {string}  – image URL (required)
 *   fallbackAlt  {string}  – text to use while loading / on error
 *   className    {string}  – CSS classes forwarded to <img>
 *   ...rest                – any other <img> props forwarded as-is
 */

import { useState, useEffect, useRef } from 'react';
import { generateAltTag } from '../utils/groqClient';

export default function AltImage({ src, fallbackAlt = '', className = '', ...rest }) {
  const [alt, setAlt] = useState(fallbackAlt);
  const prevSrc = useRef(null);

  useEffect(() => {
    // Skip if src unchanged or missing
    if (!src || src === prevSrc.current) return;
    prevSrc.current = src;

    let cancelled = false;
    generateAltTag(src, fallbackAlt).then((generated) => {
      if (!cancelled) setAlt(generated);
    });

    return () => {
      cancelled = true;
    };
  }, [src, fallbackAlt]);

  return <img src={src} alt={alt} className={className} {...rest} />;
}
