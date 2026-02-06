import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const LAST_UPDATED = 'February 5, 2026';
const COMPANY_NAME = 'FieldConnect';
const CONTACT_EMAIL = 'privacy@fieldconnect.app';
const WEBSITE_URL = 'https://field-connect-xi.vercel.app';

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.updated}>Last Updated: {LAST_UPDATED}</Text>

        <Section title="Introduction">
          <P>
            {COMPANY_NAME} ("we," "our," or "us") is committed to protecting your privacy.
            This Privacy Policy explains how we collect, use, disclose, and safeguard your
            information when you use our mobile application and web service (collectively, the "Service").
          </P>
          <P>
            Please read this Privacy Policy carefully. By using the Service, you agree to the
            collection and use of information in accordance with this policy.
          </P>
        </Section>

        <Section title="Information We Collect">
          <SubSection title="Information You Provide">
            <BulletList items={[
              'Account Information: Email address, name, and password when you create an account',
              'Project Data: Project names, addresses, and details you enter',
              'Daily Log Content: Tasks, workers, equipment, materials, visitors, and notes you record',
              'Voice Recordings: Audio recordings you create for transcription purposes',
              'Photos: Images you capture or upload for documentation',
              'Contact Information: Names and details of team members, contractors, and inspectors you add',
            ]} />
          </SubSection>

          <SubSection title="Information Collected Automatically">
            <BulletList items={[
              'Device Information: Device type, operating system, and unique device identifiers',
              'Usage Data: Features used, time spent in app, and interaction patterns',
              'Location Data: GPS coordinates when you choose to tag locations (only with your permission)',
              'Log Data: IP address, browser type, and access times',
            ]} />
          </SubSection>

          <SubSection title="Information from Third Parties">
            <BulletList items={[
              'Authentication Providers: If you sign in using a third-party service',
              'Analytics Services: Aggregated usage statistics to improve our Service',
            ]} />
          </SubSection>
        </Section>

        <Section title="How We Use Your Information">
          <P>We use the information we collect to:</P>
          <BulletList items={[
            'Provide, maintain, and improve the Service',
            'Process and transcribe your voice recordings into text',
            'Generate daily reports and documentation',
            'Analyze patterns and insights from your project data',
            'Send you technical notices, updates, and support messages',
            'Respond to your comments, questions, and requests',
            'Protect against fraudulent, unauthorized, or illegal activity',
            'Comply with legal obligations',
          ]} />
        </Section>

        <Section title="Data Storage and Security">
          <P>
            Your data is stored on secure servers provided by industry-leading cloud providers.
            We implement appropriate technical and organizational measures to protect your personal
            information against unauthorized access, alteration, disclosure, or destruction.
          </P>
          <P>
            Voice recordings are processed for transcription and may be temporarily stored during
            processing. You can delete your recordings at any time through the app.
          </P>
          <P>
            Photos and documents are stored securely and associated with your projects.
            Only users with access to the specific project can view these files.
          </P>
        </Section>

        <Section title="Data Sharing and Disclosure">
          <P>We do not sell your personal information. We may share your information in the following situations:</P>
          <BulletList items={[
            'With Your Consent: When you explicitly authorize us to share information',
            'Team Members: With other users you invite to your projects',
            'Service Providers: With vendors who assist in providing the Service (hosting, transcription, analytics)',
            'Legal Requirements: When required by law or to protect our rights',
            'Business Transfers: In connection with a merger, acquisition, or sale of assets',
          ]} />
        </Section>

        <Section title="Third-Party Services">
          <P>Our Service integrates with the following third-party services:</P>
          <BulletList items={[
            'OpenAI: For voice transcription and AI-powered features',
            'Cloudinary: For photo storage and processing',
            'Railway/PostgreSQL: For secure database hosting',
          ]} />
          <P>
            Each third-party service has its own privacy policy governing the use of your information.
          </P>
        </Section>

        <Section title="Your Rights and Choices">
          <P>Depending on your location, you may have the following rights:</P>
          <BulletList items={[
            'Access: Request a copy of the personal data we hold about you',
            'Correction: Request correction of inaccurate personal data',
            'Deletion: Request deletion of your personal data',
            'Portability: Request a copy of your data in a portable format',
            'Opt-out: Opt out of certain data processing activities',
            'Withdraw Consent: Withdraw consent for data processing where applicable',
          ]} />
          <P>
            To exercise these rights, please contact us at {CONTACT_EMAIL}.
          </P>
        </Section>

        <Section title="Data Retention">
          <P>
            We retain your personal information for as long as your account is active or as needed
            to provide you with the Service. You can delete your account and associated data at any
            time by contacting us.
          </P>
          <P>
            Project data is retained until you delete it or close your account. We may retain
            certain information as required by law or for legitimate business purposes.
          </P>
        </Section>

        <Section title="Children's Privacy">
          <P>
            The Service is not intended for children under 13 years of age. We do not knowingly
            collect personal information from children under 13. If you become aware that a child
            has provided us with personal information, please contact us.
          </P>
        </Section>

        <Section title="International Data Transfers">
          <P>
            Your information may be transferred to and processed in countries other than your own.
            These countries may have different data protection laws. We take appropriate safeguards
            to ensure your information remains protected.
          </P>
        </Section>

        <Section title="Changes to This Privacy Policy">
          <P>
            We may update this Privacy Policy from time to time. We will notify you of any changes
            by posting the new Privacy Policy on this page and updating the "Last Updated" date.
          </P>
          <P>
            You are advised to review this Privacy Policy periodically for any changes.
          </P>
        </Section>

        <Section title="Contact Us">
          <P>
            If you have questions or concerns about this Privacy Policy or our data practices,
            please contact us at:
          </P>
          <View style={styles.contactBox}>
            <Text style={styles.contactName}>{COMPANY_NAME}</Text>
            <Text style={styles.contactText}>Email: {CONTACT_EMAIL}</Text>
            <Text style={styles.contactText}>Website: {WEBSITE_URL}</Text>
          </View>
        </Section>

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// Helper Components
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.subSection}>
      <Text style={styles.subSectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

function BulletList({ items }: { items: string[] }) {
  return (
    <View style={styles.bulletList}>
      {items.map((item, index) => (
        <View key={index} style={styles.bulletItem}>
          <Text style={styles.bullet}>{'\u2022'}</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 8,
  },
  updated: {
    fontSize: 14,
    color: '#888',
    marginBottom: 32,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111',
    marginBottom: 12,
  },
  subSection: {
    marginBottom: 16,
  },
  subSectionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 15,
    color: '#555',
    marginBottom: 12,
    lineHeight: 22,
  },
  bulletList: {
    marginLeft: 16,
    marginBottom: 12,
  },
  bulletItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  bullet: {
    color: '#888',
    marginRight: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    color: '#555',
    lineHeight: 22,
  },
  contactBox: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  contactName: {
    fontWeight: '600',
    color: '#111',
    marginBottom: 4,
  },
  contactText: {
    color: '#555',
  },
});
