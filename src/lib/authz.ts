import type { Attempt, Competition, Learner, Participant } from "./types";

export class AuthzError extends Error {
  constructor(
    public status: 401 | 403 | 404,
    message: string,
  ) {
    super(message);
  }
}

/** Hosts can only manage and view results for competitions they own. */
export function assertHostOwnsCompetition(hostId: string | null, competition: Competition | null): Competition {
  if (!hostId) throw new AuthzError(401, "Sign in as a host to continue.");
  // Return 404 rather than 403 so competition ids cannot be probed.
  if (!competition || competition.ownerId !== hostId) throw new AuthzError(404, "Competition not found.");
  return competition;
}

/** A participant record belongs to the learner identified by the server-issued session token. */
export function assertLearnerOwnsParticipant(learner: Learner | null, participant: Participant | null): Participant {
  if (!learner) throw new AuthzError(401, "Join with a room code to continue.");
  if (!participant || participant.learnerId !== learner.id) throw new AuthzError(404, "Not found.");
  return participant;
}

export function assertParticipantOwnsAttempt(participant: Participant, attempt: Attempt | null): Attempt {
  if (!attempt || attempt.participantId !== participant.id) throw new AuthzError(404, "Attempt not found.");
  return attempt;
}

/** Participants can only submit while the competition is open. */
export function assertCompetitionOpen(competition: Competition): void {
  if (competition.status !== "open") throw new AuthzError(403, "This competition is not open right now.");
}

/** Hosts may only use library content (ownerId null) or their own content. */
export function canHostUseContent(hostId: string, item: { ownerId: string | null }): boolean {
  return item.ownerId === null || item.ownerId === hostId;
}
