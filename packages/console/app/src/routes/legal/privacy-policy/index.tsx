import "../../brand/index.css"
import "./index.css"
import { Title, Meta, Link } from "@solidjs/meta"
import { Header } from "~/component/header"
import { config } from "~/config"
import { Footer } from "~/component/footer"
import { Legal } from "~/component/legal"

export default function PrivacyPolicy() {
  return (
    <main data-page="legal">
      <Title>Agent-Core | Privacy Policy</Title>
      <Link rel="canonical" href={`${config.baseUrl}/legal/privacy-policy`} />
      <Meta name="description" content="Agent-Core privacy policy" />
      <div data-component="container">
        <Header />
        <div data-component="content">
          <section data-component="brand-content">
            <article data-component="privacy-policy">
              <h1>Privacy Policy</h1>
              <p>This policy is being updated. Please check back soon.</p>
            </article>
          </section>
          <Footer />
        </div>
      </div>
      <Legal />
    </main>
  )
}
