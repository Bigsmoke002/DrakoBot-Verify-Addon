// cmd_unverify.js
const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unverify')
    .setDescription('Löscht die Verifizierung eines Users, damit er erneut verifiziert werden kann.')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('Wähle den User, der un-verifiziert werden soll')
        .setRequired(true)
    ),
  async execute(interaction) {
    try {
      // Berechtigungsprüfung - nur Administratoren oder Moderatoren dürfen diesen Befehl nutzen
      if (!interaction.memberPermissions.has('Administrator') && 
          !interaction.memberPermissions.has('ModerateMembers')) {
        return interaction.reply({
          content: 'Du hast keine Berechtigung, diesen Befehl zu verwenden.',
          ephemeral: true
        });
      }

      const targetUser = interaction.options.getUser('target');
      const dataDir = path.join(__dirname, 'verify_data');
      const filePath = path.join(dataDir, `${targetUser.id}.json`);
      
      // Überprüfung, ob das Verzeichnis existiert
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          // Versuche, die Rolle zu entfernen, wenn der User noch auf dem Server ist
          try {
            const targetMember = await interaction.guild.members.fetch(targetUser.id);
            // Config laden, um die Rolle zu finden
            const configPath = path.join(__dirname, 'verify_config.json');
            if (fs.existsSync(configPath)) {
              const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
              if (config.role && targetMember) {
                await targetMember.roles.remove(config.role);
              }
            }
          } catch (e) {
            // Ignorieren, wenn der User nicht mehr auf dem Server ist oder die Rolle nicht entfernt werden kann
            console.error(`Fehler beim Entfernen der Rolle: ${e.message}`);
          }
          
          // user.tag ist veraltet, verwende stattdessen username
          return interaction.reply({
            content: `Die Verifizierung für **${targetUser.username}** wurde gelöscht. Er/sie kann sich jetzt erneut verifizieren.`,
            ephemeral: true
          });
        } catch (err) {
          console.error(`Fehler beim Löschen der Verifizierungsdatei: ${err.message}`);
          return interaction.reply({
            content: `Fehler beim Löschen der Verifizierung für **${targetUser.username}**.`,
            ephemeral: true
          });
        }
      } else {
        return interaction.reply({
          content: `Für **${targetUser.username}** existiert keine Verifizierungsdatei.`,
          ephemeral: true
        });
      }
    } catch (err) {
      console.error(`Fehler in cmd_unverify.js: ${err.message}`);
      return interaction.reply({
        content: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es später erneut.',
        ephemeral: true
      });
    }
  },
};