import re
content = open('apps/management-console/src/client/App.tsx').read()
match = re.search(r'(<div className="page-container">\s*{pathname === \'/subscribers\' && \(\s*<div>\s*<div className="page-header">.*?</div>)(.*?)(\s*<div className="grid grid-cols-2">)', content, re.DOTALL)
print(match.group(2))
