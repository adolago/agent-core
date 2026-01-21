import "./index.css"
import { Title } from "@solidjs/meta"

export default function Home() {
  return (
    <main data-page="home">
      <Title>Agent-Core | AI coding agent built for the terminal</Title>
      <div data-component="content">
        <section data-component="top">
          <h1 data-slot="title">Agent-Core</h1>
          <p data-slot="subtitle">The AI coding agent built for the terminal.</p>
          <a href="/docs">Get started</a>
        </section>
      </div>
    </main>
  )
}
