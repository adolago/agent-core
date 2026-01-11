#!/usr/bin/env npx tsx
/**
 * Store Ruth's information in Qdrant vector database
 *
 * This script reads Ruth's profile and stores it as semantic memories
 * in the zee_memories Qdrant collection.
 */

import { getMemory, type Memory } from "../src/memory/unified.js";
import type { MemoryInput } from "../src/memory/types.js";

// Ruth's memories to store
const ruthMemories: MemoryInput[] = [
  // Relationship core fact
  {
    category: "relationship",
    content: "Ruth Vieira Melo dos Anjos is Artur's life partner. They have been together since August 25, 2021, met on June 21, 2021, and started living together on August 10, 2022. They consider themselves husband and wife.",
    summary: "Ruth is Artur's life partner since 2021",
    metadata: {
      importance: 1.0,
      entities: ["ruth_vieira", "artur"],
      tags: ["partner", "relationship", "ruth"],
    },
  },

  // Contact information
  {
    category: "fact",
    content: "Ruth's contact information: WhatsApp +43 664 75188459 (primary), email ruthvieiramelo@hotmail.com, work email vienna@worldbank.org, Telegram available. IFC office phone +43 (0)1 217 0797.",
    summary: "Ruth's contact details",
    metadata: {
      importance: 0.9,
      entities: ["ruth_vieira"],
      tags: ["contact", "phone", "email", "ruth"],
    },
  },

  // Personal details
  {
    category: "fact",
    content: "Ruth Vieira was born on April 9, 1999 in Salvador, Bahia, Brazil. Her full name is Ruth Vieira Melo dos Anjos.",
    summary: "Ruth's birth date and place",
    metadata: {
      importance: 0.8,
      entities: ["ruth_vieira"],
      tags: ["birthday", "personal", "ruth"],
    },
  },

  // Work information
  {
    category: "fact",
    content: "Ruth works at IFC (International Finance Corporation), the World Bank Group's private markets arm. She is an Analyst in the Special Operations division (CS). Previously she worked in the Financial Institution Group in LAC from São Paulo. Her office is at Praterstrasse 31, Galaxy Tower, 1020 Vienna, Austria (floors 1/19/21). She works Monday to Thursday with a ~10 minute walk commute.",
    summary: "Ruth works at IFC Vienna as an Analyst",
    metadata: {
      importance: 0.85,
      entities: ["ruth_vieira", "ifc"],
      tags: ["work", "career", "ifc", "ruth"],
    },
  },

  // Living situation
  {
    category: "fact",
    content: "Ruth and Artur currently live at Schoellerhofgasse 4, 1020 Vienna, Austria. They are moving to Taborstrasse 71 on March 2nd, 2026. They moved to Vienna from São Paulo because of Ruth's job opportunity at IFC.",
    summary: "Ruth lives in Vienna, moving March 2026",
    metadata: {
      importance: 0.8,
      entities: ["ruth_vieira", "artur"],
      tags: ["home", "address", "vienna", "ruth"],
    },
  },

  // Pet Mike
  {
    category: "fact",
    content: "Ruth and Artur have a pet dog named Mike, an 11-year-old Pomeranian. Mike has lived with them since February 2024. Before that, Mike was with Ruth's mother in Vitória da Conquista, Bahia, Brazil since 2019.",
    summary: "Mike is Ruth and Artur's Pomeranian dog",
    metadata: {
      importance: 0.7,
      entities: ["ruth_vieira", "artur", "mike_dog"],
      tags: ["pet", "dog", "mike", "ruth"],
    },
  },

  // Communication preferences
  {
    category: "preference",
    content: "Communication style between Artur and Ruth: Artur prefers to ask Ruth for things via message (WhatsApp/Telegram) so he has a written record to help remember. Ruth prefers to ask Artur for things in person. For formalized discussions, they use scheduled hours/reminders/appointments.",
    summary: "Communication styles: Artur prefers messages, Ruth prefers in-person",
    metadata: {
      importance: 0.85,
      entities: ["ruth_vieira", "artur"],
      tags: ["communication", "preference", "ruth"],
    },
  },

  // Finances
  {
    category: "fact",
    content: "Ruth and Artur split finances 50/50 and track expenses via Splitwise. They coordinate responsibilities through scheduled hours, reminders, and appointments.",
    summary: "Ruth and Artur split finances 50/50 via Splitwise",
    metadata: {
      importance: 0.7,
      entities: ["ruth_vieira", "artur"],
      tags: ["finances", "splitwise", "ruth"],
    },
  },

  // Key dates reminder
  {
    category: "note",
    content: "Important dates for Ruth: April 9 - Ruth's birthday, August 25 - Partnership anniversary, June 21 - Anniversary of meeting, March 2 (2026) - Moving day to Taborstrasse 71.",
    summary: "Ruth's important dates to remember",
    metadata: {
      importance: 0.9,
      entities: ["ruth_vieira", "artur"],
      tags: ["dates", "reminder", "birthday", "anniversary", "ruth"],
    },
  },
];

async function main() {
  console.log("Initializing MemoryStore...");

  const store = getMemory({
    qdrant: {
      url: "http://localhost:6333",
      collection: "zee_memories",
    },
    embedding: {
      provider: "local",
      model: "BAAI/bge-m3",
      dimensions: 1024,
      baseUrl: "http://localhost:8080",
    },
    namespace: "zee",
  });

  console.log("Storing Ruth's memories in Qdrant...\n");

  for (const memory of ruthMemories) {
    try {
      const entry = await store.save(memory);
      console.log(`✓ Stored: ${memory.summary}`);
      console.log(`  ID: ${entry.id}`);
      console.log(`  Category: ${entry.category}`);
      console.log();
    } catch (err) {
      console.error(`✗ Failed to store: ${memory.summary}`);
      console.error(`  Error: ${err}`);
      console.log();
    }
  }

  // Test search
  console.log("\n--- Testing semantic search ---\n");

  const searches = [
    "Who is Ruth?",
    "What is Ruth's phone number?",
    "Where does Ruth work?",
    "When is Ruth's birthday?",
  ];

  for (const query of searches) {
    console.log(`Query: "${query}"`);
    try {
      const results = await store.search({ query, limit: 2, threshold: 0.3 });
      if (results.length === 0) {
        console.log("  No results found");
      } else {
        for (const r of results) {
          console.log(`  [${r.score.toFixed(3)}] ${r.entry.summary || r.entry.content.slice(0, 60)}...`);
        }
      }
    } catch (err) {
      console.log(`  Error: ${err}`);
    }
    console.log();
  }

  // Print stats
  console.log("\n--- Memory Statistics ---\n");
  const stats = await store.stats();
  console.log(`Total entries: ${stats.total}`);
  console.log("By category:", stats.byCategory);
}

main().catch(console.error);
