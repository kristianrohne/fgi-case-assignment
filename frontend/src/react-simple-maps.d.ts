// Minimal hand-written declarations for react-simple-maps v3.
// The package ships no .d.ts files; this is enough for our usage.
declare module "react-simple-maps" {
  import type { ReactNode, SVGProps } from "react";

  export interface ComposableMapProps {
    projection?: string;
    projectionConfig?: Record<string, unknown>;
    width?: number;
    height?: number;
    style?: React.CSSProperties;
    className?: string;
    children?: ReactNode;
  }
  export function ComposableMap(props: ComposableMapProps): JSX.Element;

  export interface ZoomableGroupProps {
    center?: [number, number];
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    translateExtent?: [[number, number], [number, number]];
    onMoveStart?: (pos: { coordinates: [number, number]; zoom: number }) => void;
    onMove?: (pos: { coordinates: [number, number]; zoom: number }) => void;
    onMoveEnd?: (pos: { coordinates: [number, number]; zoom: number }) => void;
    children?: ReactNode;
  }
  export function ZoomableGroup(props: ZoomableGroupProps): JSX.Element;

  export interface GeographiesProps {
    geography: string | Record<string, unknown>;
    children: (args: { geographies: GeoFeature[] }) => ReactNode;
  }
  export interface GeoFeature {
    rsmKey: string;
    id?: string | number;
    type: string;
    properties: Record<string, unknown>;
    geometry: Record<string, unknown>;
  }
  export function Geographies(props: GeographiesProps): JSX.Element;

  export interface GeographyProps extends SVGProps<SVGPathElement> {
    geography: GeoFeature;
    style?: { default?: object; hover?: object; pressed?: object };
  }
  export function Geography(props: GeographyProps): JSX.Element;

  export interface MarkerProps extends SVGProps<SVGGElement> {
    coordinates: [number, number];
    children?: ReactNode;
  }
  export function Marker(props: MarkerProps): JSX.Element;

  export interface GraticuleProps extends SVGProps<SVGPathElement> {
    step?: [number, number];
  }
  export function Graticule(props: GraticuleProps): JSX.Element;
}
