// Exercise the application's actual selection logic against real corpus results.
import { readFileSync } from 'node:fs';
import { keywordExpression, selectSources } from '../../src/services/rag/ranking.ts';
import { KnowledgeConversation } from '../../src/services/rag/conversation.ts';

const input = JSON.parse(readFileSync(0, 'utf8'));
let output;
if (input.action === 'prepare') {
  output = input.cases.map(({ question, previousQuestions = [] }) => {
    const conversation = new KnowledgeConversation();
    // Previous user turns deliberately have no generated reply, as in the bug.
    for (const previous of previousQuestions) conversation.prepareQuestion(previous);
    return conversation.prepareQuestion(question).searchText;
  });
} else if (input.action === 'keywords') {
  output = input.questions.map((question) => keywordExpression(question, input.config));
} else {
  output = input.cases.map(({ vectors, keywordIds }) => selectSources(vectors, keywordIds, input.config));
}
process.stdout.write(JSON.stringify(output));
