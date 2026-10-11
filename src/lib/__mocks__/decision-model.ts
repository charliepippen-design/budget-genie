import type { Answer, DecisionModel, Question } from '../../../api/_decisions';

export const noulAnswer = (noul: number): Answer => ({ type: 'noul', noul });

export const choiceAnswer = (choice: string, p = 0.95, confidence = 0.9): Answer => ({
  type: 'choice',
  choice,
  probabilities: { [choice]: p },
  confidence,
});

type Handler = (state: unknown, questions: Record<string, Question>) => Promise<Record<string, Answer>> | Record<string, Answer>;

/** Deterministic decision model: returns fixed answers, or whatever the handler returns or throws. */
export function mockDecisionModel(answers: Record<string, Answer> | Handler): DecisionModel & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    id: 'mock',
    calls,
    async decide(state, questions) {
      calls.push(state);
      return typeof answers === 'function' ? answers(state, questions) : answers;
    },
  };
}
