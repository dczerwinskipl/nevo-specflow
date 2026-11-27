import { describe, expect, it } from 'vitest';
import { sessionTitleOf } from './agentStepTitle';

const review = { stepId: 'review-breakdown', stepTitle: 'Review the breakdown', attempt: 1 };
const implement = {
  stepId: 'implement',
  stepTitle: 'Implementation',
  attempt: 2,
  taskId: 'T-04',
  taskTitle: 'Token exchange',
};

describe('the title line of a Session', () => {
  it('names an agent step Session by its step, with its Task, the attempt left to the facts', () => {
    expect(sessionTitleOf(undefined, review)).toBe('Review the breakdown');
    expect(sessionTitleOf('Agent step execution', review)).toBe('Review the breakdown');
    expect(sessionTitleOf('Review the breakdown · attempt 1', review)).toBe('Review the breakdown');
    expect(sessionTitleOf('Implementation · attempt 2 · Token exchange', implement)).toBe(
      'Implementation · Token exchange',
    );
  });

  it('keeps a title the owner gave, and any title of another Session', () => {
    expect(sessionTitleOf('Breakdown follow-up', review)).toBe('Breakdown follow-up');
    expect(sessionTitleOf('Specification draft', undefined)).toBe('Specification draft');
    expect(sessionTitleOf(undefined, undefined)).toBeUndefined();
  });
});
