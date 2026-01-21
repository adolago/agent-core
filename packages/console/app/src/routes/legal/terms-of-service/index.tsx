import "../../brand/index.css"
import "./index.css"
import { Title, Meta, Link } from "@solidjs/meta"
import { Header } from "~/component/header"
import { config } from "~/config"
import { Footer } from "~/component/footer"
import { Legal } from "~/component/legal"

export default function TermsOfService() {
  return (
    <main data-page="legal">
      <Title>Agent-Core | Terms of Service</Title>
      <Link rel="canonical" href={`${config.baseUrl}/legal/terms-of-service`} />
      <Meta name="description" content="Agent-Core terms of service" />
      <div data-component="container">
        <Header />
        <div data-component="content">
          <section data-component="brand-content">
            <article data-component="terms-of-service">
              <h1>Terms of Service</h1>
              <p>These terms are being updated. Please check back soon.</p>
            </article>
          </section>
          <Footer />
        </div>
      </div>
      <Legal />
    </main>
  )
}
