/**
 * Auto-growing textarea with max-height and mobile optimizations
 * Grows as user types, scrolls when hitting max-height
 */

import React, { useRef, useEffect } from "react";

interface AutoGrowTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

export function AutoGrowTextarea({
  value,
  onChange,
  className = "",
  style = {},
  ...props
}: AutoGrowTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get scrollHeight
    textarea.style.height = "auto";

    // Grow up to max-height
    const maxHeight = 120; // 5 lines at ~24px each
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);

    textarea.style.height = `${newHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      className={`resize-none overflow-y-auto ${className}`}
      style={{
        maxHeight: "clamp(40px, 20vh, 120px)",
        ...style,
      }}
      rows={1}
      {...props}
    />
  );
}
