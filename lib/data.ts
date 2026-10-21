import 'server-only';
import { liveData } from './data/live';
import { sampleData } from './data/sample';
import type { DataSource } from './data/source';
import { supabaseConfig } from './supabase/config';

// The one place pages get data from. With SUPABASE_URL and
// SUPABASE_PUBLISHABLE_KEY set it reads Supabase as the signed-in teammate;
// without them it serves the sample data, so the dashboard runs with no setup.
// Both sources return the same shapes (lib/types.ts).

export type { ClipExtension, NewPost, NewPostTarget, PostMediaExtension, RunWithStatus, Saved, VariantEdit } from './data/source';

/** True when Supabase is not configured and pages show the sample data. */
export const usingSampleData = (): boolean => supabaseConfig() === null;

const source = (): DataSource => (usingSampleData() ? sampleData : liveData);

export const getNow: DataSource['getNow'] = () => source().getNow();
export const getCurrentUser: DataSource['getCurrentUser'] = () => source().getCurrentUser();
export const getRuns: DataSource['getRuns'] = () => source().getRuns();
export const getRun: DataSource['getRun'] = (id) => source().getRun(id);
export const getCompetitors: DataSource['getCompetitors'] = () => source().getCompetitors();
export const getCompetitor: DataSource['getCompetitor'] = (id) => source().getCompetitor(id);
export const getStrategies: DataSource['getStrategies'] = () => source().getStrategies();
export const getStrategy: DataSource['getStrategy'] = (id) => source().getStrategy(id);
export const getStrategyForCompetitor: DataSource['getStrategyForCompetitor'] = (id) => source().getStrategyForCompetitor(id);
export const getAdSets: DataSource['getAdSets'] = () => source().getAdSets();
export const getAdSet: DataSource['getAdSet'] = (id) => source().getAdSet(id);
export const getAgents: DataSource['getAgents'] = () => source().getAgents();
export const getNextScan: DataSource['getNextScan'] = () => source().getNextScan();
export const getNotices: DataSource['getNotices'] = () => source().getNotices();
export const getActivity: DataSource['getActivity'] = () => source().getActivity();
export const getSearchIndex: DataSource['getSearchIndex'] = () => source().getSearchIndex();
export const getBrandProfile: DataSource['getBrandProfile'] = () => source().getBrandProfile();
export const getBrandMemory: DataSource['getBrandMemory'] = () => source().getBrandMemory();

export const createRun: DataSource['createRun'] = (input, page) => source().createRun(input, page);
export const startRunFromAds: DataSource['startRunFromAds'] = (input) => source().startRunFromAds(input);
export const createShotUpload: DataSource['createShotUpload'] = (extension) => source().createShotUpload(extension);
export const deleteShot: DataSource['deleteShot'] = (path) => source().deleteShot(path);
export const createReferenceUpload: DataSource['createReferenceUpload'] = (extension) => source().createReferenceUpload(extension);
export const deleteReference: DataSource['deleteReference'] = (path) => source().deleteReference(path);
export const saveVariant: DataSource['saveVariant'] = (id, edit) => source().saveVariant(id, edit);
export const approveVariant: DataSource['approveVariant'] = (id) => source().approveVariant(id);
export const saveBrandProfile: DataSource['saveBrandProfile'] = (profile) => source().saveBrandProfile(profile);
export const saveBrandMemory: DataSource['saveBrandMemory'] = (memory) => source().saveBrandMemory(memory);
export const addBrandExample: DataSource['addBrandExample'] = (example) => source().addBrandExample(example);
export const removeBrandExample: DataSource['removeBrandExample'] = (id) => source().removeBrandExample(id);
export const rememberPost: DataSource['rememberPost'] = (postId, place, note) => source().rememberPost(postId, place, note);
export const saveVideoEdit: DataSource['saveVideoEdit'] = (id, edit) => source().saveVideoEdit(id, edit);
export const saveDesign: DataSource['saveDesign'] = (id, design) => source().saveDesign(id, design);
export const getLongVideos: DataSource['getLongVideos'] = () => source().getLongVideos();
export const getLongVideo: DataSource['getLongVideo'] = (id) => source().getLongVideo(id);
export const createLongVideo: DataSource['createLongVideo'] = (input) => source().createLongVideo(input);
export const askMomentsAgain: DataSource['askMomentsAgain'] = (id) => source().askMomentsAgain(id);
export const removeLongVideo: DataSource['removeLongVideo'] = (id) => source().removeLongVideo(id);
export const recordMomentRun: DataSource['recordMomentRun'] = (id, first, last, title, runId) => source().recordMomentRun(id, first, last, title, runId);
export const getLeads: DataSource['getLeads'] = () => source().getLeads();
export const saveLeadCriteria: DataSource['saveLeadCriteria'] = (criteria) => source().saveLeadCriteria(criteria);
export const setLeadsSource: DataSource['setLeadsSource'] = (from, zoho) => source().setLeadsSource(from, zoho);
export const setLeadVerdict: DataSource['setLeadVerdict'] = (id, verdict, note) => source().setLeadVerdict(id, verdict, note);
export const judgeLeadsAgain: DataSource['judgeLeadsAgain'] = (id) => source().judgeLeadsAgain(id);
export const readLeadsNow: DataSource['readLeadsNow'] = () => source().readLeadsNow();
export const savePostLink: DataSource['savePostLink'] = (link) => source().savePostLink(link);
export const getAiVideos: DataSource['getAiVideos'] = () => source().getAiVideos();
export const getAiVideo: DataSource['getAiVideo'] = (id) => source().getAiVideo(id);
export const getVideoBudget: DataSource['getVideoBudget'] = () => source().getVideoBudget();
export const priceVideo: DataSource['priceVideo'] = (request) => source().priceVideo(request);
export const pricePicture: DataSource['pricePicture'] = (quality) => source().pricePicture(quality);
export const askForVideo: DataSource['askForVideo'] = (request, credits) => source().askForVideo(request, credits);
export const removeAiVideo: DataSource['removeAiVideo'] = (id) => source().removeAiVideo(id);
export const createVideoPictureUpload: DataSource['createVideoPictureUpload'] = (extension) => source().createVideoPictureUpload(extension);
export const deleteVideoPicture: DataSource['deleteVideoPicture'] = (path) => source().deleteVideoPicture(path);
export const setVideoSettings: DataSource['setVideoSettings'] = (live, cap) => source().setVideoSettings(live, cap);
export const getClipUrl: DataSource['getClipUrl'] = (path) => source().getClipUrl(path);
export const createClipUpload: DataSource['createClipUpload'] = (extension) => source().createClipUpload(extension);
export const deleteClipUpload: DataSource['deleteClipUpload'] = (path) => source().deleteClipUpload(path);

export const getTeamSettings: DataSource['getTeamSettings'] = () => source().getTeamSettings();
export const saveAgentSettings: DataSource['saveAgentSettings'] = (settings) => source().saveAgentSettings(settings);
export const savePostPages: DataSource['savePostPages'] = (pages) => source().savePostPages(pages);
export const setPostForReal: DataSource['setPostForReal'] = (place, on) => source().setPostForReal(place, on);
export const setCompetitorTracked: DataSource['setCompetitorTracked'] = (id, tracked) => source().setCompetitorTracked(id, tracked);
export const continueRun: DataSource['continueRun'] = (runId) => source().continueRun(runId);
export const continueWithAds: DataSource['continueWithAds'] = (runId, adIds) => source().continueWithAds(runId, adIds);
export const continueWithAngles: DataSource['continueWithAngles'] = (runId, angleIds) => source().continueWithAngles(runId, angleIds);
export const getRunPicks: DataSource['getRunPicks'] = (runId) => source().getRunPicks(runId);

export const getPosts: DataSource['getPosts'] = () => source().getPosts();
export const schedulePost: DataSource['schedulePost'] = (post) => source().schedulePost(post);
export const cancelPost: DataSource['cancelPost'] = (id) => source().cancelPost(id);
export const reschedulePost: DataSource['reschedulePost'] = (id, at) => source().reschedulePost(id, at);
export const askForPicture: DataSource['askForPicture'] = (id, prompt) => source().askForPicture(id, prompt);
export const usePicture: DataSource['usePicture'] = (id, pictureId) => source().usePicture(id, pictureId);
export const stopPicture: DataSource['stopPicture'] = (id) => source().stopPicture(id);
export const removePicture: DataSource['removePicture'] = (id) => source().removePicture(id);
export const retryPost: DataSource['retryPost'] = (id, place) => source().retryPost(id, place);
/** The page's name and site as a video frame names them. */
export async function getFrameBrand(): Promise<{ name: string; website: string }> {
  const brand = await getBrandProfile();
  return { name: brand.pageName, website: brand.website.replace(/^https?:\/\//, '').replace(/\/$/, '') };
}

export const createPostUpload: DataSource['createPostUpload'] = (extension) => source().createPostUpload(extension);
export const createEditMediaUpload: DataSource['createEditMediaUpload'] = (extension) => source().createEditMediaUpload(extension);
export const deleteEditMedia: DataSource['deleteEditMedia'] = (path) => source().deleteEditMedia(path);
export const signEditMedia: DataSource['signEditMedia'] = (paths) => source().signEditMedia(paths);
export const deletePostMedia: DataSource['deletePostMedia'] = (path) => source().deletePostMedia(path);
