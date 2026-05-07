import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, FlatList,
  TouchableOpacity, ActivityIndicator, Alert, Modal, Keyboard,
  KeyboardAvoidingView, Platform, RefreshControl
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { OPENAI_API_KEY } from '@env';

// ==================== CONSTANTS ====================
const COLORS = {
  primary: '#4CAF50',
  secondary: '#FF9800',
  accent: '#2196F3',
  background: '#f5f5f5',
  white: '#FFFFFF',
  text: '#333333',
  gray: '#9E9E9E',
  error: '#F44336',
  success: '#4CAF50',
  warning: '#FFC107'
};

const STORAGE_KEYS = {
  CHAT_HISTORY: 'chat_history',
  QUIZ_HISTORY: 'quiz_history',
  RECENT_PDFS: 'recent_pdfs',
  AI_CREDITS: 'ai_credits'
};

// ==================== OPENAI SERVICE ====================
const API_URL = 'https://api.openai.com/v1/chat/completions';

const sendMessageToAI = async (userMessage, conversationHistory = []) => {
  try {
    const messages = [
      { role: 'system', content: 'You are an expert AI study assistant. Help students learn effectively. Be clear, encouraging, and thorough.' },
      ...conversationHistory.slice(-5).map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
      })),
      { role: 'user', content: userMessage }
    ];

    const response = await axios.post(API_URL, {
      model: 'gpt-3.5-turbo',
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI Error:', error);
    throw new Error('Failed to get AI response');
  }
};

const generateQuizFromText = async (text) => {
  try {
    const prompt = `Create a 3-question multiple choice quiz from this text. Return ONLY valid JSON in this exact format:
    {"questions":[
      {"question":"...","options":["A","B","C","D"],"correctAnswer":"A","explanation":"..."}
    ]}
    
    Text: ${text.substring(0, 1500)}`;

    const response = await axios.post(API_URL, {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1000
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    let quizData = response.data.choices[0].message.content;
    quizData = quizData.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(quizData);
  } catch (error) {
    console.error('Quiz Error:', error);
    throw new Error('Failed to generate quiz');
  }
};

// ==================== CONTEXT ====================
const AppContext = createContext();

const useApp = () => useContext(AppContext);

const AppProvider = ({ children }) => {
  const [chatHistory, setChatHistory] = useState([]);
  const [quizHistory, setQuizHistory] = useState([]);
  const [recentPDFs, setRecentPDFs] = useState([]);
  const [aiCredits, setAiCredits] = useState(10);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadSavedData(); }, []);

  const loadSavedData = async () => {
    try {
      const savedCredits = await AsyncStorage.getItem(STORAGE_KEYS.AI_CREDITS);
      const savedChat = await AsyncStorage.getItem(STORAGE_KEYS.CHAT_HISTORY);
      const savedQuiz = await AsyncStorage.getItem(STORAGE_KEYS.QUIZ_HISTORY);
      const savedPDFs = await AsyncStorage.getItem(STORAGE_KEYS.RECENT_PDFS);
      
      if (savedCredits) setAiCredits(JSON.parse(savedCredits));
      if (savedChat) setChatHistory(JSON.parse(savedChat));
      if (savedQuiz) setQuizHistory(JSON.parse(savedQuiz));
      if (savedPDFs) setRecentPDFs(JSON.parse(savedPDFs));
    } catch (error) {
      console.error('Load error:', error);
    }
  };

  const saveChatHistory = async (history) => {
    await AsyncStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(history));
    setChatHistory(history);
  };

  const saveQuizHistory = async (quiz) => {
    const updated = [quiz, ...quizHistory].slice(0, 50);
    await AsyncStorage.setItem(STORAGE_KEYS.QUIZ_HISTORY, JSON.stringify(updated));
    setQuizHistory(updated);
  };

  const saveRecentPDF = async (pdf) => {
    const updated = [pdf, ...recentPDFs.filter(p => p.name !== pdf.name)].slice(0, 20);
    await AsyncStorage.setItem(STORAGE_KEYS.RECENT_PDFS, JSON.stringify(updated));
    setRecentPDFs(updated);
  };

  const useCredit = async () => {
    if (aiCredits > 0) {
      const newCredits = aiCredits - 1;
      setAiCredits(newCredits);
      await AsyncStorage.setItem(STORAGE_KEYS.AI_CREDITS, JSON.stringify(newCredits));
      return true;
    }
    return false;
  };

  const addCredits = async (amount) => {
    const newCredits = aiCredits + amount;
    setAiCredits(newCredits);
    await AsyncStorage.setItem(STORAGE_KEYS.AI_CREDITS, JSON.stringify(newCredits));
  };

  return (
    <AppContext.Provider value={{
      chatHistory, setChatHistory: saveChatHistory,
      quizHistory, saveQuizHistory,
      recentPDFs, saveRecentPDF,
      aiCredits, useCredit, addCredits,
      loading, setLoading
    }}>
      {children}
    </AppContext.Provider>
  );
};

// ==================== REWARDED AD BUTTON ====================
const RewardedAdButton = ({ onRewardEarned, creditsAmount = 5 }) => {
  const handleWatchAd = () => {
    Alert.alert(
      '🎬 Watch Ad',
      `Watch a short video to earn ${creditsAmount} AI credits!`,
      [
        { text: 'Watch Now', onPress: () => onRewardEarned(creditsAmount) },
        { text: 'Later', style: 'cancel' }
      ]
    );
  };

  return (
    <TouchableOpacity style={styles.rewardButton} onPress={handleWatchAd}>
      <Icon name="play-circle-filled" size={24} color={COLORS.white} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.rewardButtonText}>Get Free Credits</Text>
        <Text style={styles.rewardSubtext}>Watch ad for {creditsAmount} credits</Text>
      </View>
      <Icon name="videocam" size={20} color={COLORS.white} />
    </TouchableOpacity>
  );
};

// ==================== PDF UPLOADER ====================
const PDFUploader = ({ onPDFUpload, loading }) => {
  const [fileName, setFileName] = useState('');

  const simulateUpload = () => {
    const samplePDF = {
      name: 'study_material.pdf',
      date: new Date().toISOString(),
      text: 'Artificial Intelligence is transforming education. Machine learning algorithms can personalize learning paths. Natural language processing enables intelligent tutoring systems. Computer vision helps grade assignments automatically. AI will continue to revolutionize how we learn and teach.'
    };
    setFileName(samplePDF.name);
    onPDFUpload(samplePDF);
  };

  return (
    <TouchableOpacity style={styles.uploadButton} onPress={simulateUpload} disabled={loading}>
      {loading ? <ActivityIndicator color="white" /> : <Icon name="cloud-upload" size={24} color="white" />}
      <Text style={styles.uploadButtonText}>
        {loading ? 'Processing...' : fileName ? `📄 ${fileName}` : 'Upload PDF (Demo)'}
      </Text>
    </TouchableOpacity>
  );
};

// ==================== HOME SCREEN ====================
const HomeScreen = ({ navigation }) => {
  const { recentPDFs, quizHistory, chatHistory, aiCredits, addCredits, saveRecentPDF, setLoading, loading } = useApp();
  const [summary, setSummary] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const stats = {
    pdfs: recentPDFs.length,
    chats: chatHistory.length,
    quizzes: quizHistory.length,
    avgScore: Math.round(quizHistory.reduce((sum, q) => sum + (q.score || 0), 0) / (quizHistory.length || 1))
  };

  const handlePDFUpload = async (pdfData) => {
    setLoading(true);
    try {
      saveRecentPDF(pdfData);
      setSummary(`✅ "${pdfData.name}" processed! The AI has analyzed this document. Go to Quiz tab to test your knowledge!`);
      Alert.alert('Success', 'PDF processed! Visit Quiz tab to get started.');
    } catch (error) {
      Alert.alert('Error', 'Failed to process PDF');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(false)} />}>
      <View style={styles.header}>
        <Text style={styles.welcomeText}>AI Study Assistant</Text>
        <Text style={styles.subtitle}>Your personal AI learning companion</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}><Icon name="description" size={24} color={COLORS.primary} /><Text style={styles.statNumber}>{stats.pdfs}</Text><Text>PDFs</Text></View>
        <View style={styles.statBox}><Icon name="chat" size={24} color={COLORS.accent} /><Text style={styles.statNumber}>{stats.chats}</Text><Text>Chats</Text></View>
        <View style={styles.statBox}><Icon name="quiz" size={24} color={COLORS.secondary} /><Text style={styles.statNumber}>{stats.quizzes}</Text><Text>Quizzes</Text></View>
      </View>

      <View style={styles.creditsCard}>
        <Text style={styles.cardTitle}>✨ AI Credits: {aiCredits}</Text>
        <Text style={styles.cardText}>Each chat message costs 1 credit. Watch ads to earn more!</Text>
        <RewardedAdButton onRewardEarned={addCredits} creditsAmount={5} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📄 Upload Study Material</Text>
        <Text style={styles.cardText}>Upload PDF to generate quizzes and summaries</Text>
        <PDFUploader onPDFUpload={handlePDFUpload} loading={loading} />
      </View>

      {summary ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📚 Summary</Text>
          <Text style={styles.summaryText}>{summary}</Text>
        </View>
      ) : null}

      <TouchableOpacity style={styles.chatButton} onPress={() => navigation.navigate('Chat')}>
        <Icon name="chat" size={24} color="white" />
        <Text style={styles.chatButtonText}>Start AI Chat</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.quizButton} onPress={() => navigation.navigate('Quiz')}>
        <Icon name="quiz" size={24} color="white" />
        <Text style={styles.quizButtonText}>Take a Quiz</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

// ==================== CHAT SCREEN ====================
const ChatScreen = () => {
  const [messages, setMessages] = useState([{
    id: '1',
    text: 'Hello! 👋 I\'m your AI study assistant. Ask me anything about your studies!',
    sender: 'ai',
    timestamp: new Date()
  }]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreditWarning, setShowCreditWarning] = useState(false);
  const { chatHistory, setChatHistory, aiCredits, useCredit, addCredits } = useApp();
  const flatListRef = useRef();

  useEffect(() => {
    if (chatHistory.length > 0 && messages.length === 1) {
      setMessages(prev => [...prev, ...chatHistory.slice(-10)]);
    }
  }, []);

  useEffect(() => {
    if (messages.length > 1) {
      setChatHistory(messages.slice(1));
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!inputText.trim()) return;
    if (aiCredits <= 0) {
      setShowCreditWarning(true);
      return;
    }

    const userMessage = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setLoading(true);
    await useCredit();

    try {
      const aiResponse = await sendMessageToAI(inputText, messages);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: aiResponse,
        sender: 'ai',
        timestamp: new Date()
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: 'Sorry, I encountered an error. Please try again.',
        sender: 'ai',
        timestamp: new Date()
      }]);
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = ({ item }) => (
    <View style={[styles.messageRow, item.sender === 'user' ? styles.userRow : styles.aiRow]}>
      <View style={[styles.messageBubble, item.sender === 'user' ? styles.userBubble : styles.aiBubble]}>
        {item.sender === 'ai' && <Icon name="smart-toy" size={16} color={COLORS.primary} style={{ marginRight: 6 }} />}
        <Text style={item.sender === 'user' ? styles.userMessageText : styles.aiMessageText}>{item.text}</Text>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.chatHeader}>
        <Text style={styles.chatHeaderTitle}>AI Tutor</Text>
        <View style={styles.creditsBadge}>
          <Icon name="stars" size={14} color={COLORS.primary} />
          <Text style={styles.creditsBadgeText}>{aiCredits} Credits</Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />

      {loading && (
        <View style={styles.typingIndicator}>
          <Text>AI is thinking...</Text>
        </View>
      )}

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder={`Ask anything... (${aiCredits} credits left)`}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || loading) && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={!inputText.trim() || loading}
        >
          <Icon name="send" size={20} color="white" />
        </TouchableOpacity>
      </View>

      <Modal visible={showCreditWarning} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Icon name="warning" size={50} color={COLORS.warning} />
            <Text style={styles.modalTitle}>Out of Credits!</Text>
            <Text style={styles.modalText}>Watch a video to earn 5 more credits and continue learning!</Text>
            <RewardedAdButton onRewardEarned={(c) => { addCredits(c); setShowCreditWarning(false); }} creditsAmount={5} />
            <TouchableOpacity onPress={() => setShowCreditWarning(false)}>
              <Text style={{ marginTop: 15, color: COLORS.gray }}>Maybe Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

// ==================== QUIZ SCREEN ====================
const QuizScreen = () => {
  const [quiz, setQuiz] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [userAnswers, setUserAnswers] = useState([]);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const { saveQuizHistory } = useApp();

  const generateQuiz = () => {
    setLoading(true);
    const sampleText = "Artificial Intelligence (AI) is transforming education. Machine learning personalizes learning paths. Natural language processing enables intelligent tutoring. Computer vision automates grading.";
    
    generateQuizFromText(sampleText)
      .then(quizData => {
        setQuiz(quizData);
        setLoading(false);
      })
      .catch(() => {
        // Fallback quiz if API fails
        setQuiz({
          questions: [
            { question: 'What is AI?', options: ['Artificial Intelligence', 'Apple Intelligence', 'Automated Input', 'Advanced Interface'], correctAnswer: 'Artificial Intelligence', explanation: 'AI stands for Artificial Intelligence.' },
            { question: 'Which technology personalizes learning?', options: ['Blockchain', 'Machine Learning', 'Virtual Reality', 'Cloud Computing'], correctAnswer: 'Machine Learning', explanation: 'Machine Learning algorithms personalize learning paths.' },
            { question: 'What enables intelligent tutoring systems?', options: ['NLP', 'VR', 'AR', 'IoT'], correctAnswer: 'NLP', explanation: 'Natural Language Processing powers intelligent tutoring.' }
          ]
        });
        setLoading(false);
      });
  };

  const handleAnswer = (answer) => {
    const isCorrect = answer === quiz.questions[currentQuestion].correctAnswer;
    const newAnswers = [...userAnswers, { answer, isCorrect, question: quiz.questions[currentQuestion] }];
    setUserAnswers(newAnswers);
    
    if (currentQuestion + 1 < quiz.questions.length) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      setQuizCompleted(true);
    }
  };

  const calculateScore = () => {
    const correct = userAnswers.filter(a => a.isCorrect).length;
    return { correct, total: quiz.questions.length, percentage: (correct / quiz.questions.length) * 100 };
  };

  if (!quiz && !loading) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.quizHeader}>
          <Text style={styles.quizHeaderTitle}>Quiz Zone</Text>
          <Text style={styles.quizHeaderSubtitle}>Test your knowledge!</Text>
        </View>
        <View style={styles.quizUploadContainer}>
          <Icon name="assignment" size={60} color={COLORS.secondary} />
          <Text style={styles.quizUploadText}>Generate a quiz from your study material</Text>
          <TouchableOpacity style={styles.generateQuizButton} onPress={generateQuiz}>
            <Text style={styles.generateQuizButtonText}>Generate Quiz</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ marginTop: 15 }}>Generating smart quiz...</Text>
      </View>
    );
  }

  if (showResults) {
    const score = calculateScore();
    return (
      <ScrollView style={styles.container}>
        <View style={styles.resultsCard}>
          <Text style={styles.resultsTitle}>Quiz Results</Text>
          <View style={styles.scoreCircle}>
            <Text style={styles.scorePercentage}>{Math.round(score.percentage)}%</Text>
          </View>
          <Text style={styles.scoreText}>You got {score.correct} out of {score.total} correct!</Text>
          <TouchableOpacity 
            style={styles.resetQuizButton}
            onPress={() => {
              setQuiz(null);
              setCurrentQuestion(0);
              setUserAnswers([]);
              setQuizCompleted(false);
              setShowResults(false);
            }}
          >
            <Text style={styles.resetQuizButtonText}>Take New Quiz</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (quizCompleted) {
    const score = calculateScore();
    return (
      <View style={styles.centerContainer}>
        <Icon name="check-circle" size={60} color={COLORS.success} />
        <Text style={{ fontSize: 24, marginVertical: 15 }}>Quiz Complete!</Text>
        <TouchableOpacity 
          style={styles.viewResultsBtn}
          onPress={() => {
            saveQuizHistory({ id: Date.now(), score: score.percentage });
            setShowResults(true);
          }}
        >
          <Text style={styles.viewResultsBtnText}>View Results</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const q = quiz.questions[currentQuestion];
  return (
    <ScrollView style={styles.container}>
      <View style={styles.quizProgress}>
        <Text>Question {currentQuestion + 1} of {quiz.questions.length}</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${((currentQuestion + 1) / quiz.questions.length) * 100}%` }]} />
        </View>
      </View>
      
      <View style={styles.questionCard}>
        <Text style={styles.questionText}>{q.question}</Text>
        {q.options.map((opt, idx) => (
          <TouchableOpacity key={idx} style={styles.quizOption} onPress={() => handleAnswer(opt)}>
            <Text style={styles.quizOptionLetter}>{String.fromCharCode(65 + idx)}.</Text>
            <Text style={styles.quizOptionText}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
};

// ==================== NAVIGATION ====================
const Tab = createBottomTabNavigator();

const AppNavigator = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      tabBarIcon: ({ color, size }) => {
        const icons = { Home: 'home', Chat: 'chat', Quiz: 'quiz' };
        return <Icon name={icons[route.name]} size={size} color={color} />;
      },
      tabBarActiveTintColor: COLORS.primary,
      tabBarInactiveTintColor: COLORS.gray,
      headerStyle: { backgroundColor: COLORS.primary },
      headerTintColor: COLORS.white,
      headerTitleStyle: { fontWeight: 'bold' }
    })}
  >
    <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Study Hub' }} />
    <Tab.Screen name="Chat" component={ChatScreen} options={{ title: 'AI Tutor' }} />
    <Tab.Screen name="Quiz" component={QuizScreen} options={{ title: 'Quiz Zone' }} />
  </Tab.Navigator>
);

// ==================== MAIN APP ====================
export default function App() {
  return (
    <AppProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </AppProvider>
  );
}

// ==================== STYLES ====================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { backgroundColor: COLORS.primary, padding: 25, alignItems: 'center' },
  welcomeText: { fontSize: 24, fontWeight: 'bold', color: COLORS.white },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 5, textAlign: 'center' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', padding: 20, marginTop: -15 },
  statBox: { alignItems: 'center', backgroundColor: COLORS.white, padding: 15, borderRadius: 12, minWidth: 100, elevation: 3 },
  statNumber: { fontSize: 22, fontWeight: 'bold', color: COLORS.primary, marginVertical: 5 },
  card: { backgroundColor: COLORS.white, margin: 15, padding: 18, borderRadius: 12, elevation: 3 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  cardText: { color: '#666', marginBottom: 12, lineHeight: 20 },
  summaryText: { color: '#444', lineHeight: 20, marginTop: 8 },
  creditsCard: { backgroundColor: '#E8F5E9', margin: 15, padding: 18, borderRadius: 12, borderWidth: 1, borderColor: COLORS.primary },
  uploadButton: { backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 10, gap: 10 },
  uploadButtonText: { color: COLORS.white, fontSize: 16, fontWeight: 'bold' },
  rewardButton: { backgroundColor: COLORS.secondary, flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, marginTop: 10 },
  rewardButtonText: { color: COLORS.white, fontSize: 16, fontWeight: 'bold' },
  rewardSubtext: { color: 'rgba(255,255,255,0.9)', fontSize: 12 },
  chatButton: { backgroundColor: COLORS.accent, margin: 15, padding: 15, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', gap: 10 },
  chatButtonText: { color: COLORS.white, fontSize: 16, fontWeight: 'bold' },
  quizButton: { backgroundColor: COLORS.secondary, margin: 15, marginTop: 0, padding: 15, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', gap: 10 },
  quizButtonText: { color: COLORS.white, fontSize: 16, fontWeight: 'bold' },
  chatHeader: { backgroundColor: COLORS.primary, padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatHeaderTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.white },
  creditsBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 15, gap: 5 },
  creditsBadgeText: { fontSize: 12, fontWeight: 'bold', color: COLORS.primary },
  messageRow: { marginBottom: 12 },
  userRow: { alignItems: 'flex-end' },
  aiRow: { alignItems: 'flex-start' },
  messageBubble: { maxWidth: '80%', padding: 12, borderRadius: 18, flexDirection: 'row', alignItems: 'center' },
  userBubble: { backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  aiBubble: { backgroundColor: COLORS.white, borderBottomLeftRadius: 4, elevation: 1 },
  userMessageText: { color: COLORS.white, fontSize: 15 },
  aiMessageText: { color: COLORS.text, fontSize: 15, flex: 1 },
  typingIndicator: { padding: 10, alignItems: 'center' },
  inputContainer: { flexDirection: 'row', padding: 12, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: '#e0e0e0' },
  input: { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 80 },
  sendButton: { backgroundColor: COLORS.primary, marginLeft: 8, width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: COLORS.gray },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: COLORS.white, borderRadius: 20, padding: 24, alignItems: 'center', width: '100%' },
  modalTitle: { fontSize: 22, fontWeight: 'bold', marginVertical: 10 },
  modalText: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 15 },
  quizHeader: { backgroundColor: COLORS.secondary, padding: 30, alignItems: 'center' },
  quizHeaderTitle: { fontSize: 28, fontWeight: 'bold', color: COLORS.white },
  quizHeaderSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 5 },
  quizUploadContainer: { alignItems: 'center', padding: 40 },
  quizUploadText: { fontSize: 16, textAlign: 'center', color: '#666', marginVertical: 20 },
  generateQuizButton: { backgroundColor: COLORS.secondary, paddingHorizontal: 25, paddingVertical: 12, borderRadius: 10 },
  generateQuizButtonText: { color: COLORS.white, fontSize: 16, fontWeight: 'bold' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  quizProgress: { padding: 20, backgroundColor: COLORS.white, margin: 15, borderRadius: 10 },
  progressBar: { height: 8, backgroundColor: '#e0e0e0', borderRadius: 4, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 4 },
  questionCard: { backgroundColor: COLORS.white, margin: 15, padding: 20, borderRadius: 12, elevation: 3 },
  questionText: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, lineHeight: 26 },
  quizOption: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#f5f5f5', marginBottom: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0' },
  quizOptionLetter: { fontSize: 16, fontWeight: 'bold', color: COLORS.primary, marginRight: 12 },
  quizOptionText: { fontSize: 15, flex: 1 },
  resultsCard: { margin: 20, padding: 30, backgroundColor: COLORS.white, borderRadius: 12, alignItems: 'center', elevation: 3 },
  resultsTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  scoreCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  scorePercentage: { fontSize: 36, fontWeight: 'bold', color: COLORS.white },
  scoreText: { fontSize: 16, textAlign: 'center', marginBottom: 20 },
  resetQuizButton: { backgroundColor: COLORS.primary, paddingHorizontal: 25, paddingVertical: 12, borderRadius: 10 },
  resetQuizButtonText: { color: COLORS.white, fontSize: 16, fontWeight: 'bold' },
  viewResultsBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, marginTop: 15 },
  viewResultsBtnText: { color: COLORS.white, fontSize: 16, fontWeight: 'bold' }
});
