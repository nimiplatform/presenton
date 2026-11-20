import React, { forwardRef } from 'react';

type ImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | { src: string; width?: number; height?: number };
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
  quality?: number;
  placeholder?: string;
  blurDataURL?: string;
};

const Image = forwardRef<HTMLImageElement, ImageProps>(function Image(
  {
    src,
    alt = '',
    fill,
    priority,
    unoptimized: _unoptimized,
    quality: _quality,
    placeholder: _placeholder,
    blurDataURL: _blurDataURL,
    style,
    loading,
    ...rest
  },
  ref,
) {
  const resolvedSrc = typeof src === 'string' ? src : src.src;
  const mergedStyle: React.CSSProperties | undefined = fill
    ? { position: 'absolute', height: '100%', width: '100%', inset: 0, ...style }
    : style;

  return (
    <img
      ref={ref}
      src={resolvedSrc}
      alt={alt}
      loading={priority ? 'eager' : loading}
      style={mergedStyle}
      {...rest}
    />
  );
});

export default Image;
