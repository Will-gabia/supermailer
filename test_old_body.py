import re

content = open('apps/management-console/src/client/App.tsx').read()
match = re.search(r'(<div className="page-container">\s*{pathname === \'/subscribers\' && \(\s*<div>\s*<div className="page-header">.*?</div>)(.*?)(\s*<div className="grid grid-cols-2">)', content, re.DOTALL)

old_body = match.group(2)
opens = len(re.findall(r'<div\b[^>]*>', old_body))
closes = len(re.findall(r'</div', old_body))
print("old_body opens:", opens, "closes:", closes)
