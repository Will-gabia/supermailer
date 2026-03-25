import re

diff = open('diff.txt').read()

added_opens = 0
added_closes = 0
removed_opens = 0
removed_closes = 0

for line in diff.split('\n'):
    if line.startswith('+') and not line.startswith('+++'):
        added_opens += len(re.findall(r'<div\b[^>]*>', line))
        added_closes += len(re.findall(r'</div', line))
    elif line.startswith('-') and not line.startswith('---'):
        removed_opens += len(re.findall(r'<div\b[^>]*>', line))
        removed_closes += len(re.findall(r'</div', line))

print("added opens:", added_opens, "added closes:", added_closes)
print("removed opens:", removed_opens, "removed closes:", removed_closes)
