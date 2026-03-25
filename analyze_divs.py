import re

content = open('apps/management-console/src/client/App.tsx').read()
def count_tags(text, tag):
    return len(re.findall(r'<' + tag + r'\b[^>]*>', text)), len(re.findall(r'</' + tag + r'>', text))

print("divs:", count_tags(content, 'div'))
print("spans:", count_tags(content, 'span'))
print("ul:", count_tags(content, 'ul'))
print("li:", count_tags(content, 'li'))
