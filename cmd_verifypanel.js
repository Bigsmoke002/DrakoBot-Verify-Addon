// cmd_verifypanel.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verifypanel')
    .setDescription('Erstellt ein schönes Verifizierungspanel mit eigenem Text und Link.')
    .addStringOption(option =>
      option
        .setName('top_text')
        .setDescription('Der fett gedruckte Text oben im Panel.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('discord_link')
        .setDescription('Dein Einladungslink oder sonstiger Discord-Link.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('language')
        .setDescription('Wähle die Sprache (de oder en).')
        .setRequired(true)
        .addChoices(
          { name: 'Deutsch', value: 'de' },
          { name: 'English', value: 'en' }
        )
    )
    // Berechtigungsbeschränkung hinzufügen
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageGuild),
  
  async execute(interaction) {
    try {
      // Berechtigungsprüfung, um sicherzustellen, dass nur berechtigte Benutzer das Panel erstellen können
      if (!interaction.memberPermissions.has('Administrator') && 
          !interaction.memberPermissions.has('ManageGuild')) {
        return interaction.reply({
          content: 'Du hast keine Berechtigung, diesen Befehl zu verwenden.',
          ephemeral: true
        });
      }
      
      // Eingaben aus dem Slash-Command
      const topText = interaction.options.getString('top_text');
      const link = interaction.options.getString('discord_link');
      const language = interaction.options.getString('language');

      // Link validieren
      if (!link.startsWith('https://discord.gg/') && 
          !link.startsWith('https://discord.com/') && 
          !link.includes('discord')) {
        return interaction.reply({
          content: 'Der eingegebene Link scheint kein gültiger Discord-Link zu sein. Bitte überprüfe den Link und versuche es erneut.',
          ephemeral: true
        });
      }

      // Embed-Beschreibung aufbauen
      // 1. Dein Wunschtext in **fett**
      // 2. Der Discord-Link
      // 3. Ein Satz zum Verify-Button (Deutsch oder Englisch)
      let embedDescription = `**${topText}**\n\n${link}\n\n`;

      if (language === 'de') {
        embedDescription += `Klicke auf **"Verify"**, um dich zu verifizieren.`;
      } else {
        embedDescription += `Click **"Verify"** to start verifying.`;
      }

      // Embed erstellen (mit z.B. Discord-typischer Blurple-Farbe)
      const embed = new EmbedBuilder()
        .setColor(0x5865F2) // Discord-Blurple
        .setDescription(embedDescription)
        .setTimestamp(); // Zeigt unten rechts die aktuelle Zeit an

      // Buttons: "Verify" & "Sprache wechseln"
      // Bei Deutsch: "Verifizieren" & "Change language to English"
      // Bei Englisch: "Verify" & "Sprache auf Deutsch wechseln"
      let verifyLabel = 'Verify';
      let switchLabel = 'Sprache auf Deutsch wechseln 🇩🇪';

      if (language === 'de') {
        verifyLabel = 'Verifizieren';
        switchLabel = 'Change language to English 🇺🇸';
      }

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('start_verify') // Darauf reagiert dein verify.js
            .setLabel(verifyLabel)
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('switch_language')
            .setLabel(switchLabel)
            .setStyle(ButtonStyle.Secondary)
        );

      // Nachricht für alle sichtbar machen (ephemeral: false)
      await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: false
      });
      
      // Bestätigung an den Befehlsausführer senden
      await interaction.followUp({
        content: language === 'de' 
          ? 'Das Verifizierungspanel wurde erfolgreich erstellt!' 
          : 'The verification panel was successfully created!',
        ephemeral: true
      });
    } catch (error) {
      console.error(`Fehler in cmd_verifypanel.js: ${error.message}`);
      return interaction.reply({
        content: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es später erneut.',
        ephemeral: true
      });
    }
  },
};