declare module 'virtuoso' {
  import { ReactNode, ReactElement } from 'react';

  interface VirtuosoProps<T> {
    data: T[];
    itemContent: (index: number, item: T) => ReactElement;
    footer?: () => ReactElement | null;
    header?: () => ReactElement | null;
    increaseViewportBy?: { top: number; bottom: number };
    autoScrollBehavior?: 'smooth' | 'auto' | 'none';
    style?: React.CSSProperties;
    className?: string;
  }

  export function Virtuoso<T = any>(props: VirtuosoProps<T>): ReactElement;
}
