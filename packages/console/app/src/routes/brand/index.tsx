import "./index.css"
import { Title, Meta, Link } from "@solidjs/meta"
import { Header } from "~/component/header"
import { config } from "~/config"
import { Footer } from "~/component/footer"
import { Legal } from "~/component/legal"

export default function Brand() {
  return (
    <main data-page="enterprise">
      <Title>Agent-Core | Brand</Title>
      <Link rel="canonical" href={`${config.baseUrl}/brand`} />
      <Meta name="description" content="Agent-Core brand guidelines" />
      <div data-component="container">
        <Header />
        <div data-component="content">
          <section data-component="brand-content">
            <h1>Brand assets</h1>
            <p>Brand assets are being refreshed. Check back soon.</p>
          </section>
        </div>
        <Footer />
      </div>
      <Legal />
    </main>
  )
}
