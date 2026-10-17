declare module 'imagetracerjs' {
  interface TraceSegment {
    type: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    x3?: number;
    y3?: number;
  }

  interface TracePath {
    segments: TraceSegment[];
    isholepath?: boolean;
  }

  interface TraceLayer {
    paths: TracePath[];
    color?: { r: number; g: number; b: number; a: number };
  }

  interface TraceData {
    layers: TraceLayer[];
    palette?: { r: number; g: number; b: number; a: number }[];
    width?: number;
    height?: number;
  }

  const ImageTracer: {
    imagedataToTracedata(
      imageData: ImageData,
      options?: Record<string, unknown>,
    ): TraceData;
  };

  export default ImageTracer;
}
