# Nimmt die DOM-eigenen Swift-Dateien ins erzeugte Xcode-Projekt auf (läuft nur in GitHub Actions).
# Aufruf: ruby ios-resources/projekt-ergaenzen.rb DomGeraet.swift
# Die Dateien müssen schon in ios/App/App/ liegen.
require 'xcodeproj'

projekt = Xcodeproj::Project.open('ios/App/App.xcodeproj')
ziel = projekt.targets.find { |t| t.name == 'App' } or abort('Ziel „App“ nicht gefunden')
gruppe = projekt.main_group.children.find { |g| g.respond_to?(:path) && (g.path == 'App' || g.display_name == 'App') }
abort('Gruppe „App“ nicht gefunden') unless gruppe

if gruppe.isa == 'PBXFileSystemSynchronizedRootGroup'
  puts 'Ordner wird von Xcode selbst eingelesen, nichts zu tun.'
  exit 0
end

ARGV.each do |name|
  if ziel.source_build_phase.files_references.any? { |r| r && r.path && File.basename(r.path) == name }
    puts "#{name} ist schon drin"
    next
  end
  ref = gruppe.new_reference(name)
  ziel.add_file_references([ref])
  puts "#{name} aufgenommen"
end
projekt.save
