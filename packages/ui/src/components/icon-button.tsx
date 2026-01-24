import { Button as Kobalte } from "@kobalte/core/button"
import { type ComponentProps, splitProps, onMount } from "solid-js"
import { Icon, IconProps } from "./icon"

export interface IconButtonProps extends ComponentProps<typeof Kobalte> {
  icon: IconProps["name"]
  size?: "normal" | "large"
  iconSize?: IconProps["size"]
  variant?: "primary" | "secondary" | "ghost"
}

export function IconButton(props: ComponentProps<"button"> & IconButtonProps) {
  const [split, rest] = splitProps(props, ["variant", "size", "iconSize", "class", "classList"])

  if (import.meta.env.DEV) {
    onMount(() => {
      if (!props["aria-label"] && !props.title) {
        console.warn("IconButton missing aria-label or title", props)
      }
    })
  }

  return (
    <Kobalte
      {...rest}
      data-component="icon-button"
      data-size={split.size || "normal"}
      data-variant={split.variant || "secondary"}
      classList={{
        ...(split.classList ?? {}),
        [split.class ?? ""]: !!split.class,
      }}
    >
      <Icon name={props.icon} size={split.iconSize ?? (split.size === "large" ? "normal" : "small")} />
    </Kobalte>
  )
}
