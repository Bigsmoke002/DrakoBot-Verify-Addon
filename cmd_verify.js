// cmd_verify.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const verifyModule = require('./verify');
const fs = require('fs');
const path = require('path');

console.log('🛠️ Verify-Addon: Der Befehl /verify wurde erfolgreich registriert.');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Bestätige, dass du echt bist – löse eine Challenge und verifiziere dich über die Website.'),
  async execute(interaction, client) {
    try {
      // Prüfen, ob der User bereits verifiziert ist
      const dataDir = path.join(__dirname, 'verify_data');
      const userFile = path.join(dataDir, `${interaction.user.id}.json`);
      
      if (fs.existsSync(userFile)) {
        try {
          const fileContent = fs.readFileSync(userFile, 'utf8');
          const storedData = JSON.parse(fileContent);
          
          if (storedData && storedData.verifiedAt) {
            // Formatierte Datums-Hilfs-Funktion
            function formatDate(dateInput) {
              const d = new Date(dateInput);
              if (isNaN(d.getTime())) return 'unknown';
              const day = String(d.getDate()).padStart(2, '0');
              const month = String(d.getMonth() + 1).padStart(2, '0');
              const year = d.getFullYear();
              const hours = String(d.getHours()).padStart(2, '0');
              const minutes = String(d.getMinutes()).padStart(2, '0');
              const seconds = String(d.getSeconds()).padStart(2, '0');
              return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
            }
            
            return interaction.reply({
              content: `Du bist bereits seit **${formatDate(storedData.verifiedAt)}** verifiziert. Wenn du Probleme hast, kontaktiere einen Administrator.`,
              ephemeral: true
            });
          }
        } catch (err) {
          // Fehler beim Lesen der Datei ignorieren und fortfahren
          console.error(`Fehler beim Lesen der Verifizierungsdatei: ${err.message}`);
        }
      }
      
      // Es wird nur noch die Math-Challenge genutzt
      const challengeId = uuidv4();
      const a = Math.floor(Math.random() * 20) + 1;
      const b = Math.floor(Math.random() * 20) + 1;
      const answer = a + b;
      
      // Prüfen, ob die challenges-Map initialisiert ist
      if (!verifyModule.challenges) {
        console.error("Verify-Addon: challenges-Map ist nicht initialisiert!");
        return interaction.reply({
          content: "Ein Fehler ist aufgetreten. Bitte versuche es später erneut oder kontaktiere einen Administrator.",
          ephemeral: true
        });
      }
      
      // Konfiguration laden
      let verificationLink = "http://localhost:8084";
      try {
        const configPath = path.join(__dirname, 'verify_config.json');
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          if (config.verifyLink) {
            verificationLink = config.verifyLink;
          }
        }
      } catch (err) {
        console.error(`Fehler beim Laden der Konfiguration: ${err.message}`);
      }
      
      verifyModule.challenges.set(interaction.user.id, { type: 'math', answer, challengeId, a, b });
      
      // Link zur Website 
      const fullVerificationLink = `${verificationLink}/verify?user=${interaction.user.id}&challenge=${challengeId}`;
      
      // Ein einzelner Button, um das Modal aufzurufen
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('verify_button')
            .setLabel('✅ Ich bin echt')
            .setStyle(ButtonStyle.Success)
        );
      
      await interaction.reply({
        content: `Bitte löse folgende Aufgabe:\n**${a} + ${b} = ?**\n\nBesuche diesen Link, um deine Daten zu übermitteln:\n${fullVerificationLink}\n\nKlicke anschließend auf den Button, um deine Antwort und den Website-Token einzugeben.`,
        components: [row],
        ephemeral: true,
      });
    } catch (err) {
      console.error(`Fehler in cmd_verify.js: ${err.message}`);
      return interaction.reply({
        content: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es später erneut.',
        ephemeral: true
      });
    }
  },
};