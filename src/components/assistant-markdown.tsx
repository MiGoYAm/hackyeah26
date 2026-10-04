import { StyleSheet } from 'react-native';
import Markdown, { MarkdownIt } from 'react-native-markdown-display';

import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const markdown = MarkdownIt({ html: false, breaks: true, linkify: true });

export function AssistantMarkdown({ text }: { text: string }) {
  const theme = useTheme();
  const heading = {
    fontWeight: '700' as const,
    marginTop: Spacing.two,
    marginBottom: Spacing.one,
  };
  const code = {
    color: theme.text,
    backgroundColor: theme.backgroundSelected,
    borderColor: theme.backgroundSelected,
    fontFamily: Fonts.mono,
    fontSize: 13,
    lineHeight: 18,
    borderRadius: Spacing.one,
  };
  const styles = StyleSheet.create({
    body: { color: theme.text, fontSize: 15, lineHeight: 22 },
    paragraph: { marginTop: Spacing.one, marginBottom: Spacing.one },
    textgroup: { flexShrink: 1 },
    heading1: { ...heading, fontSize: 20, lineHeight: 28 },
    heading2: { ...heading, fontSize: 18, lineHeight: 26 },
    heading3: { ...heading, fontSize: 17, lineHeight: 24 },
    heading4: { ...heading, fontSize: 16, lineHeight: 22 },
    heading5: { ...heading, fontSize: 15, lineHeight: 22 },
    heading6: { ...heading, fontSize: 15, lineHeight: 22 },
    bullet_list: { marginVertical: Spacing.one },
    ordered_list: { marginVertical: Spacing.one },
    bullet_list_icon: { marginLeft: 0, marginRight: Spacing.two },
    ordered_list_icon: { marginLeft: 0, marginRight: Spacing.two },
    code_inline: { ...code, padding: Spacing.half },
    code_block: { ...code, padding: Spacing.two, marginVertical: Spacing.one },
    fence: { ...code, padding: Spacing.two, marginVertical: Spacing.one },
    blockquote: {
      backgroundColor: theme.backgroundSelected,
      borderColor: theme.textSecondary,
      marginLeft: 0,
      marginVertical: Spacing.one,
      paddingHorizontal: Spacing.two,
    },
    link: { color: theme.accent },
    hr: { backgroundColor: theme.textSecondary, marginVertical: Spacing.two },
    table: { borderColor: theme.textSecondary, marginVertical: Spacing.one },
    tr: { borderColor: theme.textSecondary },
    th: { backgroundColor: theme.backgroundSelected, fontWeight: '700' },
  });

  return (
    <Markdown markdownit={markdown} style={styles}>
      {text || '…'}
    </Markdown>
  );
}
