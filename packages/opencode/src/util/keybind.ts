import { isDeepEqual } from "remeda"

export namespace Keybind {
  export type Info = {
    ctrl: boolean
    option: boolean
    shift: boolean
    leader: boolean
    name: string
  }

  export function match(a: Info, b: Info): boolean {
    return isDeepEqual(a, b)
  }

  export function toString(info: Info): string {
    const parts: string[] = []

    if (info.ctrl) parts.push("ctrl")
    if (info.option) parts.push("alt")
    if (info.shift) parts.push("shift")
    if (info.name) parts.push(info.name)

    let result = parts.join("+")

    if (info.leader) {
      result = `<leader>${result}`
    }

    return result
  }

  export function parse(key: string): Info[] {
    if (key === "none") return []

    return key.split(",").map((combo) => {
      // Handle <leader> syntax by replacing with leader+
      const normalized = combo.replace(/<leader>/g, "leader+")
      const parts = normalized.toLowerCase().split("+")
      const info: Info = {
        ctrl: false,
        option: false,
        shift: false,
        leader: false,
        name: "",
      }

      for (const part of parts) {
        switch (part) {
          case "ctrl":
            info.ctrl = true
            break
          case "alt":
          case "option":
            info.option = true
            break
          case "shift":
            info.shift = true
            break
          case "leader":
            info.leader = true
            break
          default:
            info.name = part
            break
        }
      }

      return info
    })
  }
}
