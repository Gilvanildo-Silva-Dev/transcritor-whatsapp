import type { SVGProps } from "react";

type IconName = "audio" | "upload" | "file" | "text" | "copy" | "download" | "check" | "close" | "arrow" | "shield" | "loader";
const paths: Record<IconName, string> = {
  audio: "M4 10v4m4-8v12m4-15v18m4-15v12m4-8v4",
  upload: "M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4",
  file: "M14 2H6v20h12V6l-4-4Zm0 0v5h5M9 12v5m3-7v9m3-6v3",
  text: "M4 5h16M4 10h16M4 15h10M4 20h7",
  copy: "M9 9h12v12H9zM15 5V3H3v12h2",
  download: "M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6",
  loader: "M21 12a9 9 0 1 1-9-9",
};
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}
