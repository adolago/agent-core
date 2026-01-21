// @ts-nocheck
import React from "react"
import { Img, Row, Html, Link, Body, Head, Button, Column, Preview, Section, Container } from "@jsx-email/all"
import { Text, Fonts, Title, A, Span } from "../components"
import {
  unit,
  body,
  frame,
  headingText,
  container,
  contentText,
  button,
  contentHighlightText,
  linkText,
  buttonText,
} from "../styles"

const CONSOLE_URL = (process.env.CONSOLE_URL ?? "").replace(/\/$/, "")
const CONSOLE_BASE_URL = CONSOLE_URL ? `${CONSOLE_URL}/` : ""
const CONSOLE_ASSETS_URL = CONSOLE_BASE_URL ? `${CONSOLE_BASE_URL}email` : "/email"
const CONSOLE_ZEN_URL = CONSOLE_BASE_URL ? `${CONSOLE_BASE_URL}zen` : "/zen"

interface InviteEmailProps {
  inviter: string
  workspaceID: string
  workspaceName: string
  assetsUrl: string
}
export const InviteEmail = ({
  inviter = "test@anoma.ly",
  workspaceID = "wrk_01K6XFY7V53T8XN0A7X8G9BTN3",
  workspaceName = "anomaly",
  assetsUrl = CONSOLE_ASSETS_URL,
}: InviteEmailProps) => {
  const messagePlain = `${inviter} invited you to join the ${workspaceName} workspace.`
  const url = `${CONSOLE_BASE_URL || "/"}workspace/${workspaceID}`
  return (
    <Html lang="en">
      <Head>
        <Title>{`Agent-Core — ${messagePlain}`}</Title>
      </Head>
      <Fonts assetsUrl={assetsUrl} />
      <Preview>{messagePlain}</Preview>
      <Body style={body} id={Math.random().toString()}>
        <Container style={container}>
          <Section style={frame}>
            <Row>
              <Column>
                <A href={CONSOLE_ZEN_URL}>
                  <Img height="32" alt="Agent-Core Logo" src={`${assetsUrl}/logo.png`} />
                </A>
              </Column>
            </Row>

            <Section style={{ padding: `${unit * 2}px 0 0 0` }}>
              <Text style={headingText}>Join your team's Agent-Core workspace</Text>
              <Text style={contentText}>
                You have been invited by <Span style={contentHighlightText}>{inviter}</Span> to join the{" "}
                <Span style={contentHighlightText}>{workspaceName}</Span> workspace on Agent-Core.
              </Text>
            </Section>

            <Section style={{ padding: `${unit}px 0 0 0` }}>
              <Button style={button} href={url}>
                <Text style={buttonText}>
                  Join workspace
                  <Img width="24" height="24" src={`${assetsUrl}/right-arrow.png`} alt="Arrow right" />
                </Text>
              </Button>
            </Section>

            <Section style={{ padding: `${unit}px 0 0 0` }}>
              <Text style={contentText}>Button not working? Copy the following link...</Text>
              <Link href={url}>
                <Text style={linkText}>{url}</Text>
              </Link>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default InviteEmail
