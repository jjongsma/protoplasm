require 'rake'
require 'find'
require 'pdoc'

base = File.dirname(File.dirname(__FILE__))
files = []
Find.find(File.join(base, 'src')) do |path|
	if FileTest.directory?(path)
		if File.basename(path)[0] == ?.
			Find.prune
		else
			next
		end
	else
		if File.basename(path)[-3,3] == '.js'
			files.push(path)
		end
	end
end

PDoc.run({
	:source_files => files,
	:destination => File.join(base, 'docs'),
	:templates => '/usr/local/share/pdoc/templates/html',
	:syntax_highlighter => :pygments,
	:markdown_parser => :bluecloth,
	#:src_code_href => proc { |file, line|
	#	'http://jongsma.org/websvn/protoplasm/src/#{file}##{line}'
	#},
	:pretty_urls => false,
	:index_page => File.join(base, 'OVERVIEW'),
	:bust_cache => true,
	:name => 'Protoplasm UI Controls',
	:short_name => 'Protoplasm',
	:home_url => 'http://jongsma.org/software/protoplasm',
	:doc_url => 'http://jongsma.org/software/protoplasm/api',
	:version => '0.2',
	:copyright_notice => 'This work is licensed under the GPLv2.' 
})
