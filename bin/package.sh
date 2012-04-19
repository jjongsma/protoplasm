#!/bin/bash
# NOTE: Run from parent directory!

if test -d dist; then
	rm -rf dist;
fi

mkdir dist
echo
echo "Copying source files..."
cp -rp src/* dist/
find dist -type d -name ".svn" | xargs rm -rf

echo
echo "Compressing source:"
echo
echo "    Compressing protoplasm.js..."
mv dist/protoplasm.js dist/protoplasm_src.js
yui-compressor dist/protoplasm_src.js > dist/protoplasm.js
echo '// All Protoplasm source code (no on-demand loading)' > dist/protoplasm_full.js
cat dist/protoplasm.js >> dist/protoplasm_full.js

for JS in dist/*/*.js; do
	echo "    Compressing $JS..."
	SRCNAME=`echo $JS | sed -e "s/.js\$/_src.js/"`
	mv $JS $SRCNAME
	yui-compressor $SRCNAME > $JS
	cat $JS >> dist/protoplasm_full.js
done

echo
echo "Creating full includes:"
echo
echo "    protoplasm_full.js..."

# Bundle all stylesheets together in one include
echo "    protoplasm_full.css..."
for CSS in dist/*/*.css; do
	CONTROL=`echo $CSS | sed -e "s/dist\/\([^\/]*\)\/[^\/]*\.css/\1/g"`
	cat $CSS | sed -e "s/url(\([^)]*\))/url($PREFIX\/\1)/g" | yui-compressor --type css >> dist/protoplasm_full.css
done

echo
echo "Creating distribution packages:"
echo
rm -f protoplasm.tgz protoplasm.zip
cd dist
echo "    protoplasm.tgz..."
tar cvzf ../protoplasm.tgz * > /dev/null
echo "    protoplasm.zip..."
zip -r ../protoplasm.zip * > /dev/null
cd ..

# Docs
echo
echo "Running PDoc:"
ruby bin/pdoc.rb
