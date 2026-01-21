async function handler() {
  return new Response("Docs are not available here.", { status: 404 })
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const DELETE = handler
export const OPTIONS = handler
export const PATCH = handler
