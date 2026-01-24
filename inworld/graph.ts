import { GraphBuilder, RemoteSTTNode } from "@inworld/runtime/graph"

const sttNode = new RemoteSTTNode()

export const graph = new GraphBuilder({
  id: "agent-core-stt",
  apiKey: process.env.INWORLD_API_KEY,
  enableRemoteConfig: false,
})
  .addNode(sttNode)
  .setStartNode(sttNode)
  .setEndNode(sttNode)
  .build()
