import re
p = '/etc/nginx/sites-enabled/dkyy.top'
s = open(p, encoding='utf-8').read()
block = '''    location /dl-files/ {
        alias /var/www/dkyy/dl/;
        index dl-not-exist.html;
        autoindex on;
        autoindex_format json;
    }

'''
if 'location /dl-files/' in s:
    # remove all existing dl-files blocks first
    s = re.sub(r'location /dl-files/ \{\n(?:.*\n)*?    \}\n', '', s)
    print('removed existing dl-files blocks')
n = len(re.findall(r'location /dl/ \{', s))
s = re.sub(r'location /dl/ \{\n(?:.*\n)*?    \}', lambda m: m.group(0) + '\n' + block, s, count=n)
open(p, 'w', encoding='utf-8').write(s)
print('dl locations found:', n)
print('dl-files blocks now:', s.count('location /dl-files/'))
