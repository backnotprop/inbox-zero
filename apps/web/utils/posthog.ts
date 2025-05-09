"use server";

import { PostHog } from "posthog-node";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("posthog");

async function getPosthogUserId(options: { email: string }) {
  const personsEndpoint = `https://app.posthog.com/api/projects/${env.POSTHOG_PROJECT_ID}/persons/`;

  // 1. find user id by distinct id
  const responseGet = await fetch(
    `${personsEndpoint}?distinct_id=${options.email}`,
    {
      headers: {
        Authorization: `Bearer ${env.POSTHOG_API_SECRET}`,
      },
    },
  );

  const resGet: { results: { id: string; distinct_ids: string[] }[] } =
    await responseGet.json();

  if (!resGet.results?.[0]) {
    logger.error("No Posthog user found with distinct id", {
      email: options.email,
    });
    return;
  }

  if (!resGet.results[0].distinct_ids?.includes(options.email)) {
    // double check distinct id
    throw new Error(
      `Distinct id ${resGet.results[0].distinct_ids} does not include ${options.email}`,
    );
  }

  const userId = resGet.results[0].id;

  return userId;
}

export async function deletePosthogUser(options: { email: string }) {
  if (!env.POSTHOG_API_SECRET || !env.POSTHOG_PROJECT_ID) {
    logger.warn("Posthog env variables not set");
    return;
  }

  // 1. find user id by distinct id
  const userId = await getPosthogUserId({ email: options.email });

  if (!userId) {
    logger.warn("No Posthog user found with distinct id", {
      email: options.email,
    });
    return;
  }

  const personsEndpoint = `https://app.posthog.com/api/projects/${env.POSTHOG_PROJECT_ID}/persons/`;

  // 2. delete user by id
  try {
    await fetch(`${personsEndpoint}${userId}/?delete_events=true`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${env.POSTHOG_API_SECRET}`,
      },
    });
  } catch (error) {
    logger.error("Error deleting Posthog user", { error });
  }
}

export async function posthogCaptureEvent(
  email: string,
  event: string,
  properties?: Record<string, any>,
  sendFeatureFlags?: boolean,
) {
  try {
    if (!env.NEXT_PUBLIC_POSTHOG_KEY) {
      logger.warn("NEXT_PUBLIC_POSTHOG_KEY not set");
      return;
    }

    const client = new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY);
    client.capture({
      distinctId: email,
      event,
      properties,
      sendFeatureFlags,
    });
    await client.shutdown();
  } catch (error) {
    logger.error("Error capturing PostHog event", { error });
  }
}
