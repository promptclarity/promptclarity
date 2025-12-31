import * as React from "react"

interface LighthouseIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string
}

export function LighthouseIcon({ size = 24, className, ...props }: LighthouseIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* Lighthouse tower */}
      <polygon points="12,28 20,28 22,14 10,14" fill="currentColor" />
      {/* Light housing */}
      <rect x="11" y="10" width="10" height="5" fill="currentColor" />
      {/* Roof */}
      <polygon points="10,10 16,5 22,10" fill="currentColor" />
      {/* Light beams */}
      <polygon points="22,8 30,4 30,8" fill="currentColor" />
      <polygon points="22,13 29,12 29,16" fill="currentColor" />
    </svg>
  )
}
