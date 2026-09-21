import { renderToStaticMarkup } from 'react-dom/server';
import { CommentMentionedEmail } from '../email/templates/comment-mentioned';
import { TaskItemAssignedEmail } from '../email/templates/task-item-assigned';
import { emailHtmlToZulipMarkdown } from './email-to-zulip';

describe('emailHtmlToZulipMarkdown', () => {
  it('converts emphasis, links and headings and drops boilerplate', () => {
    const html = [
      '<h1>Task Assigned</h1>',
      '<p>Hello <strong>Bob</strong>, see <a href="https://app.example.com/t/1">the task</a> <em>today</em>.</p>',
      '<p>or copy and paste this URL into your browser: <a href="https://app.example.com/t/1">https://app.example.com/t/1</a></p>',
      '<p>Don\'t want these? <a href="https://app.example.com/u">Manage your email preferences</a>.</p>',
      '<hr/>',
      '<p>AI that handles compliance for you - <a href="https://trycomp.ai">Comp AI</a>.</p>',
      '<p>Comp AI | 2261 Market Street, San Francisco, CA 94114</p>',
    ].join('');

    expect(
      emailHtmlToZulipMarkdown({ subject: 'Task "Deploy" assigned', html }),
    ).toBe(
      [
        '**Task "Deploy" assigned**',
        '',
        '**Task Assigned**',
        '',
        'Hello **Bob**, see [the task](https://app.example.com/t/1) *today*.',
      ].join('\n'),
    );
  });

  it('returns only the subject when the body is empty', () => {
    expect(emailHtmlToZulipMarkdown({ subject: ' Ping ', html: '' })).toBe(
      '**Ping**',
    );
  });

  it('renders the task assignment template as a readable direct message', () => {
    const subject = 'You were assigned to a task: Rotate access keys';
    const html = renderToStaticMarkup(
      TaskItemAssignedEmail({
        toName: 'Chris',
        toEmail: 'chris@example.com',
        taskTitle: 'Rotate access keys',
        assignedByName: 'Alice',
        organizationName: 'WindBorne',
        taskUrl: 'https://app.example.com/org_1/tasks/tsk_1',
      }),
    );

    const markdown = emailHtmlToZulipMarkdown({ subject, html });

    expect(
      markdown.startsWith(`**${subject}**\n\n**Task Assigned to You**`),
    ).toBe(true);
    expect(markdown).toContain('Hello Chris,');
    expect(markdown).toContain(
      '**Alice** assigned you to the task **"Rotate access keys"** in **WindBorne**.',
    );
    expect(markdown).toContain(
      '[View Task](https://app.example.com/org_1/tasks/tsk_1)',
    );
    // The hidden preview text, the URL fallback, the unsubscribe line and the
    // footer are email-only.
    expect(markdown.match(/You were assigned to a task/g)).toHaveLength(1);
    expect(markdown).not.toMatch(/copy and paste/i);
    expect(markdown).not.toMatch(/email preferences/i);
    expect(markdown).not.toMatch(/Market Street/);
    expect(markdown).not.toMatch(/handles compliance/);
    expect(markdown).not.toMatch(/\n{3,}/);
  });

  it('keeps the quoted comment for mention notifications', () => {
    const html = renderToStaticMarkup(
      CommentMentionedEmail({
        toName: 'Chris',
        toEmail: 'chris@example.com',
        commentContent: 'Can you review this @Chris?',
        mentionedByName: 'Alice',
        entityName: 'Access review',
        entityRoutePath: 'tasks',
        entityId: 'tsk_1',
        organizationId: 'org_1',
        commentUrl: 'https://app.example.com/org_1/tasks/tsk_1',
      }),
    );

    const markdown = emailHtmlToZulipMarkdown({
      subject: 'Alice mentioned you in a comment',
      html,
    });

    expect(markdown).toContain(
      '**Alice** mentioned you in a comment on **Access review**.',
    );
    expect(markdown).toContain('"Can you review this @Chris?"');
    expect(markdown).toContain(
      '[View Comment](https://app.example.com/org_1/tasks/tsk_1)',
    );
  });
});
